import * as core from '@actions/core'
import path from 'path'
import simpleGit from 'simple-git'
import {Octokit} from '@octokit/core'
import {S3, Lambda} from 'aws-sdk'
import unzip from 'unzipper'
import {PassThrough} from 'stream'
import axios from 'axios'
import fs from 'fs'

const octokit = new Octokit()

function uploadFromStream(
  regions = ['us-east-1'],
  name: string,
  bucketPrefix: string
): {
  writeStream: PassThrough[]
  promise: Promise<S3.ManagedUpload.SendData[]>
} {
  const passes: PassThrough[] = []

  // eslint-disable-next-line @typescript-eslint/promise-function-async
  const promises = regions.map(region => {
    const pass = new PassThrough()
    passes.push(pass)
    return new S3({region})
      .upload({Bucket: bucketPrefix + region, Key: name, Body: pass})
      .promise()
  })

  return {
    writeStream: passes,
    promise: Promise.all(promises)
  }
}

async function run(): Promise<void> {
  try {
    const repo: string = core.getInput('repo')
    const repoOwner: string = core.getInput('repoOwner')
    const regionsRaw: string = core.getInput('regions')
    const bucketPrefix: string = core.getInput('bucketPrefix')
    const commit: string = core.getInput('commit')

    const baseDir = path.join(process.cwd(), '')
    const git = simpleGit({baseDir})

    const regions = regionsRaw.split(',').map(region => region.trim())
    const regionalInfo = new Map<string, string | undefined>()

    // Get run data
    core.debug('Collecting existing layer data')
    for (const region of regions) {
      const lambda = new Lambda({region})
      const versions = await lambda
        .listLayerVersions({LayerName: repo})
        .promise()
      if (versions?.LayerVersions && versions?.LayerVersions.length > 0) {
        const largest = versions.LayerVersions.reduce((prev, curr) =>
          (prev?.Version ?? 0) > (curr?.Version ?? 0) ? prev : curr
        )
        if (largest.Version !== undefined) {
          const layer = await lambda
            .getLayerVersion({LayerName: repo, VersionNumber: largest.Version})
            .promise()
          regionalInfo.set(region, layer.Description)
        } else regionalInfo.set(region, undefined)
      } else {
        regionalInfo.set(region, undefined)
      }
    }

    // Check for new release
    core.debug('Checking for latest release')
    const releaseData = await octokit.request(
      'GET /repos/{owner}/{repo}/actions/artifacts',
      {
        owner: repoOwner,
        repo
      }
    )

    if (releaseData.data.total_count <= 0) {
      core.setFailed('Requested repository has no available releases!')
      // eslint-disable-next-line no-console
      console.log('fail here lol')
      return
    }

    // Description Format `[Anything] Artifact: "[ArtifactID]"`
    const description = Array.from(regionalInfo.values()).find(
      desc => desc !== undefined
    )
    const artifactIdRaw = (description?.match(/(?<=Artifact: ")\w+(?=")/) ?? [
      ''
    ])[0]
    const numberedId = parseInt(artifactIdRaw, 10)

    if (numberedId === releaseData.data.artifacts[0].id) {
      core.debug('Layer is current, will only proceed if new region added')
      if (!Array.from(regionalInfo.values()).includes(undefined)) return
    }

    // Check buckets and create if doesn't exist
    core.debug('Checking buckets')
    for (const region of regions) {
      const s3 = new S3({region})
      try {
        const bucket = await s3
          .headBucket({Bucket: bucketPrefix + region})
          .promise()
        if (bucket.$response.httpResponse.statusCode !== 200) {
          core.debug(
            `Creating new bucket ${bucketPrefix + region} in ${region}`
          )
          await s3
            .createBucket({
              Bucket: bucketPrefix + region,
              CreateBucketConfiguration: {LocationConstraint: region}
            })
            .promise()
        }
      } catch (e) {
        core.debug(`Creating new bucket ${bucketPrefix + region} in ${region}`)
        await s3
          .createBucket({
            Bucket: bucketPrefix + region,
            CreateBucketConfiguration: {LocationConstraint: region}
          })
          .promise()
      }
    }

    // Download, Unzip, Upload to S3
    core.debug('Collecting files and uploading to S3')
    const axResp = await axios.get(
      'https://api.github.com/repos/alixaxel/chrome-aws-lambda/actions/artifacts/51386671/zip',
      {
        responseType: 'stream',
        headers: {
          Authorization: `token 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`
        }
      }
    )
    const s3Info = await new Promise<S3.ManagedUpload.SendData[]>(resolve => {
      axResp.data.pipe(unzip.Parse()).on('entry', (entry: unzip.Entry) => {
        const upload = uploadFromStream(regions, entry.path, bucketPrefix)
        for (const pt of upload.writeStream) entry.pipe(pt)
        resolve(upload.promise)
      })
    })

    const objectName = s3Info.map(info => info.Key)[0]

    // Publish Version
    core.debug('Publishing layers')
    const newLayers = []
    for (const [region] of regionalInfo.entries()) {
      const lambda = new Lambda({region})
      newLayers.push(
        await lambda
          .publishLayerVersion({
            LayerName: repo,
            Description: `Latest release of ${repo} layer. Artifact: "${releaseData.data.artifacts[0].id}"`,
            Content: {S3Bucket: bucketPrefix + region, S3Key: objectName}
          })
          .promise()
      )
    }

    for (const layer of newLayers)
      core.debug(`Created layer version ${layer.LayerArn}`)

    // Update MD and config
    core.debug('Updating README')
    const regionArns = newLayers.reduce(
      (acc, newLayer) =>
        (acc += `\n| ${newLayer.LayerArn?.replace(
          'arn:aws:lambda:',
          ''
        ).replace(/:.*/, '')} | \`${newLayer.LayerArn}\` |`),
      ''
    )
    const newMD = `# Lambda Layers For ${repo}

Last updated ${new Date()}
    
| Region | ARN |
| --- | --- |${regionArns}`

    if (commit === 'true') {
      git.commit('Updated README for latest release info', 'README.md')
      fs.writeFileSync(path.join(baseDir, 'README.md'), newMD)
      git.push()
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

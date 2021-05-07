/* eslint-disable no-console */
import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  process.env['INPUT_REPO'] = 'chrome-aws-lambda'
  process.env['INPUT_REPOOWNER'] = 'alixaxel'
  process.env['INPUT_REGIONS'] = 'us-west-1,us-west-2'
  process.env['INPUT_BUCKETPREFIX'] = 'pearl-static-files-'
  process.env['INPUT_COMMIT'] = 'false'
  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  try {
    console.log(cp.execFileSync(np, [ip], options).toString())
  } catch (e) {
    console.log(e)
    console.log(e?.stdout?.toString())
    console.log(e?.stderr?.toString())
  }
})

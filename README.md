<p align="center">
  <a href="https://github.com/pearljobs/chrome-aws-lambda-layer-action/actions"><img alt="chrome-aws-lambda-layer-action status" src="https://github.com/pearljobs/chrome-aws-lambda-layer-action/workflows/build-test/badge.svg"></a>
</p>

# Action for Deploying Chrome AWS Lambda Layer (and in theory others)

This is the action I've written to auto deploy AWS Lambda Layers from [chrome-aws-lambda](https://github.com/alixaxel/chrome-aws-lambda).

## Contributing

> First, you'll need to have a reasonably modern version of `node` handy. This won't work with versions older than 9, for instance.

Install the dependencies  
```bash
$ npm install
```

Build the typescript and package it for distribution
```bash
$ npm run build && npm run package
```

Run the tests :heavy_check_mark:  
```bash
$ npm test

 PASS  ./index.test.js
  ✓ throws invalid number (3ms)
  ✓ wait 500 ms (504ms)
  ✓ test runs (95ms)

...
```

## Publishing

Actions are run from GitHub repos so we will checkin the packed dist folder. 

Then run [ncc](https://github.com/zeit/ncc) and push the results:
```bash
$ npm run package
$ git add dist
$ git commit -a -m "prod dependencies"
$ git push origin releases/v1
```

Note: We recommend using the `--license` option for ncc, which will create a license file for all of the production node modules used in your project.

Your action is now published! :rocket: 

See the [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)

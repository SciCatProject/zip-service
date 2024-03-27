[![Build Status](https://github.com/SciCatProject/zip-service/actions/workflows/test-build.yml/badge.svg?branch=develop)](https://github.com/SciCatProject/zip-service/actions)
[![DeepScan grade](https://deepscan.io/api/teams/8394/projects/16917/branches/371288/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=8394&pid=16917&bid=371288)
[![Known Vulnerabilities](https://snyk.io/test/github/SciCatProject/zip-service/develop/badge.svg?targetFile=package.json)](https://snyk.io/test/github/SciCatProject/zip-service/develop?targetFile=package.json)

# Description
A service for zipping and downloading a group of files with a common directory on the same machine as the service is running. Authorization is based on the properties username:string groups:string[] in the JWT.

# Install
`docker-compose up` or `npm install && npm start`

# Image creation
This instruction are necessary to create the image locally and than push it to the github image repository.
We hope to automate the image release in the near future.
1. pull the latest code from github repository _develop_ branch
2. create the image locally
   `> docker build -f CI/ESS/Dockerfile --tag ghcr.io/scicatproject/zip-service:<release>`
   where release is something like _alpha.__n___ with _n_ the next available number.
   Please check in the image repository available [here](https://github.com/SciCatProject/zip-service/pkgs/container/zip-service) for the next available release.
   At the time of this writing, the latest image is alpha:5., so the full command is:
   `> docker build -f CI/ESS/Dockerfile --tag ghcr.io/scicatproject/zip-service:alpha.5` 
3. login in to github through docker
   `> docker login ghcr.io`
4. push the image
   `> docker push ghcr.io/scicatproject/zip-service:alpha.<release>`
   To follow up our example, the full command will be:
   `> docker push ghcr.io/scicatproject/zip-service:alpha.5`


# Usage
## main endpoint
The main endpoint will present a default form that can be used to test the download.
The files presented in the form are included in the image available on the repository, and they are available just for testing.
This form is provided for testing and has to be screened and monitored for security purposes.


## zip with download
Zip requests are sent as POST to `/zip`, which redirect to a download progress page. The post body should have the following format:

```json
data: {
  "jwt": "token",
  "directory": "/path/to/files",
  "files": ["file1","file2","file3"]
}
```
/zip shows a page with a progress bar, resulting in a downloadable zip-file.

## zip in place
While [zip with download](zip-with-download) is a two step process (the file is zipped to a temporary directory on the server and then downloaded from the browser), another route, /zip_in_place exists which zips the payload in the same time as downloading. 

# local.config.json
Required in the root directory. 
| property key          | Data type   | Description |
| --------------------- | ----------- | ----------- |
| zipDir                | string      | directory where generated zip files are stored. Note that zip-files are deleted periodically |
| zipRetentionMillis    | number      | The number of milliseconds zip files are stored before they're deleted |
| sessionSecret         | string      | Used to sign session ids to detect client side tampering |
| facility              | string      | Different facilities have different ways of authorizing file access. This property is used to determine which mechanism to use |
| dramDirectory         | string      | Upload directory? |
| testData              | Object      | Optional. Default input values at the index route |
| testData.jwt          | string      | Optional. Default jwt |
| testData.directory    | string      | Optional. Default directory |
| testData.files        | string[]    | Optional. Default files. |


Example data
```json
{
  "zipDir": "/tmpZip",
  "zipRetentionMillis": 3600000,
  "jwtSecret": "secret123",
  "sessionSecret": "fj9832mnsaf3j9adsa",
  "facility": "maxiv",
  "dramDirectory": "uploads/",
  "testData": {
    "jwt": "<jwtToken>",
    "directory": "<testFileDirectory>",
    "files": [
      "<testFileName1>",
      "<testFileName2>",
      "<testFileName3>",
    ]
  }
}
 ```

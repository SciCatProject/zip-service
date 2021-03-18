[![Build Status](https://github.com/SciCatProject/zip-service/actions/workflows/test-build.yml/badge.svg?branch=develop)](https://github.com/SciCatProject/zip-service/actions)
[![Known Vulnerabilities](https://snyk.io/test/github/SciCatProject/zip-service/develop/badge.svg?targetFile=package.json)](https://snyk.io/test/github/SciCatProject/zip-service/develop?targetFile=package.json)

# Description
A service for zipping and downloading a group of files with a common directory on the same machine as the service is running. Authorization is based on the properties username:string groups:string[] in the JWT.

# Install
`docker-compose up` or `npm install && npm start`

# Usage
Zip requests are sent as POST to `/zip`, which redirect to a download progress page. The post body should have the following format:

```json
data: {
  "jwt": "token",
  "directory": "/path/to/files",
  "files": ["file1","file2","file3"]
}
```
/zip shows a page with a progress bar, resulting in a downloadable zip-file.

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

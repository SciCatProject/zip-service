# Description
A service for zipping and downloading a group of files with a common directory on the same machine as the service is running. Authorization is based on the property group (list of strings) in the JWT.


# Install
`docker-compose up` or `npm install && npm start`

# Usage
Zip requests are sent as POST to `/zip`, which redirect to a download progress page. The post body should have the following format:

```json
data: {
  "jwt": "token",
  "base": "/path/to/files",
  "files": ["file1","file2","file3"]
}
```

# local.config.json
```json
{  
   "path_to_zipped_files": "abs or relative path to where created zip files are stored",
   "jwtExpiresIn": "e.g. 1h",
   "jwtSecret": "******",
   "institution": "e.g. maxiv",
   "test_jwt":"HE256 base64 encoded payload (JSON object:  {username: string, groups: string[]})",
   "test_base":"optional dir for test files",
   "test_files":[  
      "optional test file 1",
      "optional test file 2",
      "optional test file 3"
    ]
 }
 ```

# Dockerizaiton (MAXIV)
`offline-0:/gpfs/lunarc0/visitors` and `offline-0:/gpfs/lunarc0/staff` are mounted  under `/data `in the docker container, so their corresponding `base` values would  be `"data/visitors"` and `"data/staff"`, respectively.
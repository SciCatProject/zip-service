# Description
A service for zipping and downloading a group of files with a common directory on the same machine as the service is running. Authorization is based on the properties username:string groups:string[] in the JWT.

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
/zip shows a page with a progress bar, resulting in a downloadable zip-file.

# local.config.json
Required in the root directory. Example file:

```json
{  
   "path_to_zipped_files": "/files",
   "jwtExpiresIn": "1h",
   "jwtSecret": "849djHEUFjkkj35437¤#&",
   "institution": "maxiv", //used to determine means of autorization
   "zip_file_retention_millis": 3600000,
   //optional HS256 base64 encoded payload (JSON object:  {username: string, groups: string[]})
   "test_jwt":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImpvbmFzIiwiZ3JvdXBzIjpbInRlc3QxIiwidGVzdDIiXX0.aaQtE8-Up6eR2h4Q5ZrWJBzeWIVg-uSmQfuuBbk4zXg", 
    //optional dir for test files
   "test_base":"/home/jonros/testdata/",
   //optional test files
   "test_files":[  
      "file_1.h5", 
      "file_2.h5", 
      "[file_3.h5" 
    ]
 }
 ```
# Dockerization (MAXIV)
`offline-0:/gpfs/lunarc0/visitors` and `offline-0:/gpfs/lunarc0/staff` are mounted  under `/data `in the docker container, so their corresponding `base` values would  be `"data/visitors"` and `"data/staff"`, respectively.
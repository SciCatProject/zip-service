# Description
A service for zipping and downloading a group of files with a common directory on the same machine as the service is running.


# Install
`docker-compose up` or `npm install && npm start`

# Usage
Zip requests are sent as POST to `/zip`, which redirect to a download progress page. The post body should have the following format:

```json
data: {
  "base": "/path/to/files",
  "files": ["file1","file2","file3"]
}
```
`offline-0:/gpfs/lunarc0/visitors` and `offline-0:/gpfs/lunarc0/staff` are mounted directly under the root in the docker container, so their corresponding `base` values would just be `"/visitors"` and `"/staff"`, respectively.
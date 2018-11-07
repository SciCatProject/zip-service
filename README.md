# Description
A service for zipping and downloading a group of files with a common directory on the same machine as the service is running.


# Install
`docker-compose up` or `npm install && npm start`

# Usage
Running on port 3011, a simple test GUI with example data is available at `/`. Zip requests are sent as POST to `/zip`, which returns a relative url to the downloadable zip-file. The post body should have the following format:

```json
{
  "base": "/path/to/files",
  "files": ["file1","file2","file3"]
}
```
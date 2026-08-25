[![Build Status](https://github.com/SciCatProject/zip-service/actions/workflows/test-build.yml/badge.svg?branch=develop)](https://github.com/SciCatProject/zip-service/actions)
[![DeepScan grade](https://deepscan.io/api/teams/8394/projects/16917/branches/371288/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=8394&pid=16917&bid=371288)
[![Known Vulnerabilities](https://snyk.io/test/github/SciCatProject/zip-service/develop/badge.svg?targetFile=package.json)](https://snyk.io/test/github/SciCatProject/zip-service/develop?targetFile=package.json)

# Description

A service for zipping and downloading a group of files, or downloading/streaming a single file, from a directory tree on the same machine as the service is running. Authorization is based on the property `groups:string[]` in the JWT, checked against a SciCat dataset's `accessGroups`/`ownerGroup`/`isPublished` fields.

The directory containing a dataset's files is not supplied by the client. Instead, it is resolved server-side from `directoryPathPattern` (see [File path resolution](#file-path-resolution)) using values read off the SciCat dataset record, so the caller only ever supplies file names, never directories.

# Install

`npm install && npm start`

# Image creation

This instruction are necessary to create the image locally and than push it to the github image repository.
We hope to automate the image release in the near future.

1. pull the latest code from github repository _develop_ branch
2. create the image locally
   `> docker build -f Dockerfile --tag ghcr.io/scicatproject/zip-service:<release>`
   where release is something like \_alpha.**n\_** with _n_ the next available number.
   Please check in the image repository available [here](https://github.com/SciCatProject/zip-service/pkgs/container/zip-service) for the next available release.
   At the time of this writing, the latest image is alpha:5., so the full command is:
   `> docker build -f Dockerfile --tag ghcr.io/scicatproject/zip-service:alpha.8`
3. login in to github through docker
   `> docker login ghcr.io`
4. push the image
   `> docker push ghcr.io/scicatproject/zip-service:alpha.<release>`
   To follow up our example, the full command will be:
   `> docker push ghcr.io/scicatproject/zip-service:alpha.8`

# Usage

## main endpoint

The main endpoint (`/`) presents links to the zip form (`/zip`) and single-file form (`/file`), which can be used to test downloading. The files presented in these forms are included in the image available on the repository, and they are available just for testing.
These forms are provided for testing and have to be screened and monitored for security purposes.

## zip with download

Zip requests are sent as POST to `/zip`, which redirects to a download progress page. The post body should have the following format:

```json
data: {
  "jwt": "token",
  "dataset": "<datasetPid>",
  "files": ["file1", "file2", "file3"]
}
```

The directory each file lives in is resolved automatically from `dataset` (see [File path resolution](#file-path-resolution)); the request no longer accepts a `directory` field. `/zip` shows a page with a progress bar, polled from `GET /zip/status`, resulting in a downloadable zip file served from `/download/<zipFileName>`.

## zip in place

While [zip with download](#zip-with-download) is a two step process (the file is zipped to a temporary directory on the server and then downloaded from the browser), another route, `/zip_in_place`, exists which zips the payload at the same time as downloading it. It accepts the same POST body as `/zip`.

## single file access

`POST /file` requests a link to a single file:

```json
data: {
  "jwt": "token",
  "dataset": "<datasetPid>",
  "fileName": "file1"
}
```

On success this returns a short-lived, single-use token that lasts for `fileLinkRetentionMillis` and three URLs built from it:

| URL | Behavior |
| --- | --- |
| `GET /file/download?token=...` | Downloads the file (`Content-Disposition: attachment`), with byte-range support. |
| `GET /file/stream?token=...` | Streams the file inline (`Content-Disposition: inline`), with byte-range support. |
| `GET /file/open?token=...` | Redirects to `hdfViewServiceUrl`, passing the stream URL so an HDF5/NeXus viewer can render the file. Requires `publicOrigin` to be configured. |

`HEAD` is also supported on `/file/download` and `/file/stream`. Passing `fileAction: "Download"` or `fileAction: "Open"` in the `POST /file` body redirects directly to the corresponding URL instead of returning JSON.

# File path resolution

Rather than trusting a client-supplied directory, the service resolves each file's directory from:

- `allowedDataDirectory` — the root directory all resolved paths must stay under.
- `directoryPathPattern` — a path template with `{keyword}` placeholders (e.g. `{instrumentIds[0]}`), and at most one `*` wildcard segment matched against the subdirectories of `allowedDataDirectory`.
- `requiredKeywords` — the list of placeholders (matching those used in `directoryPathPattern`) whose values are read off the SciCat dataset record returned for the requested `dataset` (array fields are indexed with `[n]`, e.g. `instrumentIds[0]`).

Every resolved keyword value is validated to stay within `allowedDataDirectory` and must not contain `..`. 

## Specific facility handling:
- When `facility` is `"ILL"`, keyword values are additionally normalized (e.g. `proposalId` values are prefixed with `exp_`, `type` values starting with `raw` become `rawdata`, `instrumentId` values are lower-cased) to match ILL's on-disk directory naming.

# config/config.json

Required in the root directory (loaded from `config/config.json`).
| property key | Data type | Description |
| --------------------- | ----------- | ----------- |
| routeBasePath | string | Optional. Path prefix the service is mounted under behind a reverse proxy (e.g. `/zip-service`). defaults to `/` |
| publicOrigin | string | The service's own trusted public origin (scheme + host, e.g. `https://zip-service.example.org`).|
| hdfViewServiceUrl | string | Base URL of the HDF5/NeXus view service that `GET /file/open` redirects to. |
| allowedDataDirectory | string | Root directory that all resolved file paths must stay under. |
| directoryPathPattern | string | Path template used to resolve a dataset's file directory. Supports `{keyword}` placeholders and a single `*` wildcard segment. See [File path resolution](#file-path-resolution). |
| zipDir | string | Directory where generated zip files are stored. Note that zip-files are deleted periodically. |
| zipRetentionMillis | number | The number of milliseconds zip files are stored before they're deleted. |
| fileLinkRetentionMillis | number | The number of milliseconds a single-file link/token (from `POST /file`) remains valid. |
| jwtSecret | string | Secret used to sign/verify the JWT clients authenticate with. |
| sessionSecret | string | Used to sign session ids to detect client side tampering. |
| facility | string | Different facilities have different ways of authorizing file access and naming data directories. This property is used to determine which mechanism/normalization to use (e.g. `"ILL"`). |
| requiredKeywords | string[] | Placeholder names (matching `directoryPathPattern`) whose values are read from the SciCat dataset record. |
| scicatApiBasePath | string | Base URL of the SciCat API used to look up dataset access rights. |
| scicatApiAccessToken | string | Access token used to authenticate against the SciCat API. |
| graylogEnabled | boolean | Whether to ship logs to Graylog. |
| graylogServer | string | Graylog server hostname. |
| graylogPort | number | Graylog GELF port. |
| environment | string | Deployment environment name, passed to the logger. |
| testData | Object | Optional. Default input values at the index/zip/file forms. |
| testData.jwt | string | Optional. Default jwt. |
| testData.files | string[] | Optional. Default files. |
| dramDirectory | string | Deprecated. Upload directory used by the (currently disabled) `/upload` route. |

Example data

```json
{
  "zipDir": "/tmpZip",
  "zipRetentionMillis": 3600000,
  "fileLinkRetentionMillis": 3600000,
  "jwtSecret": "secret123",
  "sessionSecret": "fj9832mnsaf3j9adsa",
  "facility": "ILL",
  "allowedDataDirectory": "/data",
  "directoryPathPattern": "/data/{sourceFolder}/{type}",
  "requiredKeywords": ["sourceFolder", "type"],
  "hdfViewServiceUrl": "https://hdf-viewer.example.org",
  "routeBasePath": "",
  "publicOrigin": "https://zip-service.example.org",
  "scicatApiBasePath": "https://scicat.example.org",
  "scicatApiAccessToken": "<scicatServiceAccountToken>",
  "testData": {
    "jwt": "<jwtToken>",
    "files": ["<testFileName1>", "<testFileName2>", "<testFileName3>"]
  }
}
```

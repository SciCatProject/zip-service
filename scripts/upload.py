#!/usr/bin/env python3


import requests
import sys
from datetime import datetime
from urllib import parse


def main(argv):
    zipfile = str(argv[0])
    accessToken = str(argv[1])

    jwt = getJWT(accessToken)

    files = {"zipfile": (zipfile, open(zipfile, "rb"), "application/zip")}
    r = requests.post("http://localhost:3012/upload",
                      files=files, data={"jwt": jwt})

    if r.status_code != 200:
        print(f"{r.status_code}: {r.text}")
    else:
        print(f"{r.status_code}: {r.json()['message']}")
        print(r.json())
        uploadRes = r.json()
        user = getUser(accessToken)
        print(user)
        dataset = postDataset(accessToken, user, uploadRes["sourceFolder"])
        print(dataset)
        origDatablocks = postOrigDatablocks(
            accessToken, user, dataset["pid"], uploadRes)
        print(origDatablocks)


def getJWT(accessToken):
    return requests.post("http://localhost:3000/api/v3/Users/jwt?access_token=" + accessToken).json()["jwt"]


def getUser(accessToken):
    return requests.get("http://localhost:3000/api/v3/Users/userInfos?access_token=" + accessToken).json()


def postDataset(accessToken, user, sourceFolder):
    dataset = {
        "accessGroups": ["loki", "odin"],
        "contactEmail": user["currentUserEmail"],
        "createdBy": "ldap." + user["currentUser"],
        "creationTime": datetime.now().isoformat(),
        "datasetName": "DRAM Dataset",
        "description": "Dataset uploaded by DRAM",
        "isPublished": False,
        "keywords": ["dram"],
        "owner": user["currentUser"],
        "ownerEmail": user["currentUserEmail"],
        "ownerGroup": "ess",
        "sourceFolder": sourceFolder,
        "type": "derived",
        "inputDatasets": [],
        "investigator": user["currentUserEmail"],
        "scientificMetadata": {},
        "usedSoftware": [],
    }

    return requests.post("http://localhost:3000/api/v3/Datasets?access_token=" + accessToken, json=dataset).json()


def postOrigDatablocks(accessToken, user, pid, uploadRes):
    dataFileList = []

    size = 0
    for f in uploadRes["files"]:
        size += int(f["size"])
        dataFileList.append({
            "path": f"{uploadRes['sourceFolder']}/{f['name']}",
            "size": int(f["size"]),
            "time": datetime.now().isoformat(),
            "chk": "12345",
            "uid": "101",
            "gid": "101",
            "perm": "755"
        })

    origDatablocks = {
        "size": size,
        "dataFileList": dataFileList,
        "ownerGroup": "ess",
        "accessGroups": ["loki", "odin"],
        "createdBy": "ldap." + user["currentUser"],
        "updatedBy": "ldap." + user["currentUser"],
        "datasetId": pid,
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    }

    return requests.post("http://localhost:3000/api/v3/Datasets/" + parse.quote_plus(pid) + "/origdatablocks?access_token=" + accessToken, json=origDatablocks).json()


if __name__ == "__main__":
    main(sys.argv[1:])

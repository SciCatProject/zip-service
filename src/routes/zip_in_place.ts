import express from "express";
import * as fs from "fs";
import * as crypto from "crypto";
// import config from "../local.config.json";
import archiver from "archiver";
import { hasFileAccess } from "../auth";

export const router = express.Router();

/* POST zip */
router.post("/", function(req: express.Request, res: express.Response) {
  const data = req.body;
  // console.log(data);
  // if (!config.jwtSecret){
  // 	res.statusCode = 500;
  // 	res.send("No JWT secret has been set for zip-service");
  // 	return;
  // }
  // try{
  // 	const jwtDecoded = jwt.verify(data["jwt"], config.jwtSecret); 
  // }catch(e){
  // 	res.render("error", {msg: "Invalid JSON web token"})
  // 	return;
  // }

  const { hasAccess, statusCode, error, directory, fileNames } = hasFileAccess(
    req,
    req.body.directory,
    req.body.files
  );
  if (!hasAccess) {
    return res.render("error", { statusCode, error });
  }
  const path = data["base"];
  try{
    const archive = archiver("zip", {
      gzip: true,
      zlib: { level: 9 },
    });
    archive.on("error", function (err) {
      console.error("Error in archiver", err);
    });
    archive.pipe(res);
    const zipFileName =
      crypto.createHash("md5").update(directory).digest("hex") +
      "_" +
      new Date().getTime() +
      ".zip";

    res.attachment(zipFileName).type("zip");
    
    fileNames.map((file) => {
      if (file.length == 0) return;
      const read = makeReadStream(`${directory}${file}`);
      archive.append(read, { name: file });
    });

    archive.on("end", function() {
      console.log("archiver closing");
      res.end();
    });
   
    archive.finalize();

  }catch(error){
    res.statusCode = 500;	
    res.send(`The files could not be zipped ${error.message}`);
    return;
  }
  function makeReadStream(filepath: string) {
    const read = fs.createReadStream(filepath);
    read.on("open", function () {
      console.log(`Reading ${this.path}`);
    });
    
    read.on("error", function(err) {
      res.end(err.message);
    });
    return read;
  }
  
});

const getFileSizeInBytes = (filename: string) => {
  const stats = fs.statSync(filename);
  return stats.size;
};


const initSession = (
  directory: string,
  fileNames: string[],
  zipFileName: string
): Global.ZipData => {
  return {
    directory,
    currentFileIndex: 0,
    files: fileNames.map((fileName: string) => {
      if (fileName.includes("<")) return;
      return {
        fileName,
        size: getFileSizeInBytes(directory + fileName),
        progress: 0,
      };
    }),
    zipFileName,
    zipSizeOnLastCompletedEntry: 0,
    ready: false,
  };
};

import express from "express";
import * as fs from "fs";
import * as config from '../local.config.json';
export const router = express.Router();


router.get('/:file', function(req, res) {
  // TODO delete/reset session data
    if (!req.params.file){
      res.statusCode = 400;
		  res.send("Missing parameter 'file'");
		  return;
    }
  try{
    const file = fs.readFileSync(config.zipDir + "/" + req.params.file, "binary");
  }catch(error){
    res.statusCode = 404;
    res.send("File not found");
    return;
  }
  res.setHeader('Content-Length', file.length);
  res.setHeader('content-disposition', 'attachment; filename=' + req.params.file);
  res.write(file, 'binary');
  res.end();
});


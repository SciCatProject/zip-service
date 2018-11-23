const express = require('express');
const router = express.Router();
const ZIP_FILES_PATH = require('../constants');

router.get('/:file', function(req, res, next) {
    if (!req.params.file){
      res.statusCode = 400;
		  res.send("Missing parameter 'file'");
		  return;
    }
  try{
    var file = require('fs').readFileSync(ZIP_FILES_PATH + "/" + req.params.file, "binary");
  }catch(error){
    res.statusCode = 400;
    res.send("File not found");
    return;
  }
  res.setHeader('Content-Length', file.length);
  res.setHeader('content-disposition', 'attachment; filename=' + req.params.file);
  res.write(file, 'binary');
  res.end();
});

module.exports = router;

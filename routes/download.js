const express = require('express');
const router = express.Router();
const config = require('../local.config.json');

router.get('/:file', function(req, res, next) {
    if (!req.params.file){
      res.statusCode = 400;
		  res.send("Missing parameter 'file'");
		  return;
    }
  try{
    var file = require('fs').readFileSync(config.path_to_zipped_files + "/" + req.params.file, "binary");
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

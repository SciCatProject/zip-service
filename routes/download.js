const express = require('express');
const router = express.Router();

/* GET download  */
router.get('/', function(req, res, next) {
    if (!req.query.file){
      res.statusCode = 400;
		  res.send("Missing parameter 'file'");
		  return;
    }
  try{
    var file = require('fs').readFileSync("files/" + req.query.file, "binary");
  }catch(error){
    res.statusCode = 400;
    res.send("File not found");
    return;
  }
  res.setHeader('Content-Length', file.length);
  res.setHeader('content-disposition', 'attachment; filename=' + req.query.file);
  res.write(file, 'binary');
  res.end();
});

module.exports = router;

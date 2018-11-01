const express = require('express');
const router = express.Router();

/* GET download  */
router.get('/', function(req, res, next) {
    if (!req.query.file){
      throw new Error("400: Missing parameter 'file'");
      
    }
  try{
    var file = require('fs').readFileSync("files/" + req.query.file, "binary");
  }catch(error){
    throw new Error("404: File not found");
  }
  res.setHeader('Content-Length', file.length);
  res.setHeader('content-disposition', 'attachment; filename=' + req.query.file);
  res.write(file, 'binary');
  res.end();
});


module.exports = router;

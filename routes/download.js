const express = require('express');
const router = express.Router();

/* GET download  */
router.get('/', function(req, res, next) {
	const fs = require('fs');
	var file = fs.readFileSync("files/" + req.query.file, "binary");

  res.setHeader('Content-Length', file.length);
  res.setHeader('content-disposition', 'attachment; filename=' + req.query.file);
  res.write(file, 'binary');
  res.end();
});


module.exports = router;

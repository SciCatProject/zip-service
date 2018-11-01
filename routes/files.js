const express = require('express');
const router = express.Router();

/* GET files listing. */
router.get('/', function(req, res, next) {
	res.send('files');
});
router.post('/', function(req, res, next){
	try{
		const json = req.body;
		const path = json["base"];
		const files = json["files"];

		const zipFile = zipFiles(path, files);
		//console.log(req.protocol + '://' + req.get('host') + req.originalUrl);
		res.send(zipFile);
	}catch(error){
		res.send("failed to parse json data")
	}
});

module.exports = router;

//curl -i -X POST http://localhost:3000/files -H "Content-Type: application/json" --data "@testdata.json"

const zipFiles = (path, files) => {
	const zipFile = require('crypto').createHash('md5').update(path).digest("hex") + "_" + new Date().getTime();
	const fs = require('fs');
	const archiver = require('archiver');
	const output = fs.createWriteStream("files/" + zipFile);
	const archive = archiver('zip', {
	gzip: true,
	zlib: { level: 9 } // Sets the compression level.
	});

	archive.on('error', function(err) {
	throw err;
	});
	output.on('close', function() {
		console.log(archive.pointer() + ' total bytes');
		console.log('archiver has been finalized and the output file descriptor has closed.');
	});
	// pipe archive data to the output file
	archive.pipe(output);
	files.map(file => archive.file(path + "/" + file, { name: file }));
	archive.finalize();
	return zipFile;
}
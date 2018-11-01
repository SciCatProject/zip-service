const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
	next(new Error('Only accepts POST'));
});

/* POST zip */
router.post('/', function(req, res, next){
	try{
		const json = req.body;
		const path = json["base"];
		const files = json["files"];
		const zipFile = zipFiles(path, files);
		res.send(zipFile);
	}catch(error){
		res.send("failed to parse json data")
	}
});
module.exports = router;

const zipFiles = (path, files) => {
	const zipFile = require('crypto').createHash('md5').update(path).digest("hex") + "_" + new Date().getTime() + ".zip";
	const fs = require('fs');
	const archiver = require('archiver');
	const fileStream = fs.createWriteStream("files/" + zipFile);
	const archive = archiver('zip', {
	gzip: true,
	zlib: { level: 9 } // Sets the compression level.
	});

	archive.on('error', function(err) {
	throw err;
	});
	fileStream.on('close', function() {
		console.log(archive.pointer() + ' total bytes');
		console.log('archiver has been finalized and the output file descriptor has closed.');
	});
	// pipe archive data to the output file
	archive.pipe(fileStream);
	files.map(file => archive.file(path + "/" + file, { name: file }));
	archive.finalize();
	return "/download?file=" + zipFile;
}
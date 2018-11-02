const express = require('express');
const router = express.Router();
const fs = require('fs');
import ZIP_FILES_PATH from '../constants';
router.get('/', function(req, res, next) {
	next(new Error('Only accepts POST'));
});

/* POST zip */
router.post('/', function(req, res, next){
	const json = req.body;
	const path = json["base"];
	if (!path || path.length === 0){
		res.statusCode = 400;
		res.send("JSON missing 'base'");
		return;
	}
	const files = json["files"];
	console.log("PATH: " + files);
	if (!files || files.length === 0){
		res.statusCode = 400;
		res.send("JSON missing 'files'");
		return;
	}
	if (!fs.existsSync(path)) {
		res.statusCode = 400;
		res.send("Directory '" + path + "' does not exist");
		return;
	}
	try{
		const zipFile = zipFiles(path, files, res);
	}catch(error){
		res.statusCode = 500;
		res.send("The files could not be zipped");
		return;
	}
});
module.exports = router;

const zipFiles = (path, files, res) => {
	const zipFile = require('crypto').createHash('md5').update(path).digest("hex") + "_" + new Date().getTime() + ".zip";
	const archiver = require('archiver');
	const fileStream = fs.createWriteStream(ZIP_FILES_PATH + zipFile);
	const archive = archiver('zip', {
	gzip: true,
	zlib: { level: 9 } // Sets the compression level.
	});

	archive.on('error', function(err) {
		throw err;
	});
	fileStream.on('close', function() {
		res.send("/download?file=" + zipFile);
	});
	archive.pipe(fileStream);
	files.map(file => archive.file(path + "/" + file, { name: file }));
	archive.finalize();

}
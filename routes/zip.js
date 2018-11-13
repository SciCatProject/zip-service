const express = require('express');
const router = express.Router();
const fs = require('fs');
const ZIP_FILES_PATH = require('../constants');
var redis = require('redis');
var client = redis.createClient();

router.get('/', function(req, res, next) {
	console.log("GET /zip");
	res.statusCode = 400;
	res.send("Only accepts POST");
	return;
});

/* POST zip */
router.post('/', function(req, res, next){
	const json = JSON.parse(req.body.data);
	console.log("POST /zip");
	console.log(json);
	const path = json["base"];
	if (!path || path.length === 0){
		res.render("error", {msg: "JSON missing 'base'"})
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
		var sessData = req.session;
		sessData.total = files.length;
		sessData.current = 0;
		sessData.zipFile = '';
		var id = sessData.id;
		client.set(id, "");
		zipFiles(path, files, req, res, id);
	}catch(error){
		res.statusCode = 500;
		res.send("The files could not be zipped");
		return;
	}

});
module.exports = router;

const zipFiles = (path, files, req, res, id) => {
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
		client.set(id, "/download?file=" + zipFile);
		req.session.zipFile= "/download?file=" + zipFile;
	});
	archive.pipe(fileStream);
	files.map(file => zipSingleFile(path, file, req, archive));
	archive.finalize();
	res.render("zipping");

}
const zipSingleFile = (path, file, req, archive)  => {
	
		fs.existsSync(path + "/" + file) ? archive.file(path + "/" + file, { name: file }) : null;
		req.session.current = req.session.current + 1;
	 
	
}
router.get("/polling", function(req, res, next){
	client.get(req.session.id, function(error, result) {
		if (error) throw error;
		if (result && result !== ""){
			res.send(result);
		}else{
			res.send(req.session.current + "");
		}
	  });
});
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
		const id = req.session.id;
		res.render("zipping", {total: ("" + files.length)});
		
		setRedisEntry(id, 0, files.length, "");
		zipFiles(path, files, id);
	}catch(error){
		res.statusCode = 500;
		res.send("The files could not be zipped");
		return;
	}

});
module.exports = router;

const zipFiles = (path, files, id) => {
	const zipFile = require('crypto').createHash('md5').update(path).digest("hex") + "_" + new Date().getTime() + ".zip";
	const archiver = require('archiver');
	const fileStream = fs.createWriteStream(ZIP_FILES_PATH + zipFile);
	const archive = archiver('zip', {
	gzip: true,
	zlib: { level: 9 }
	});

	archive.on('error', function(err) {
		throw err;
	});
	fileStream.on('close', function() {
		//getRedisEntry(id, (entry) => setRedisEntry(id, entry.current, entry.total, "/download?file=" + zipFile));
		setFileName(id, "/download?file=" + zipFile);
	});
	archive.pipe(fileStream);
	files.map(file => zipSingleFile(path, file, id, archive));
	setTimeout(function() {
		archive.finalize();
	}, 5000);

}
const zipSingleFile = (path, file, id, archive)  => {
	setTimeout(function() {
		fs.existsSync(path + "/" + file) ? archive.file(path + "/" + file, { name: file }) : null;
		incrementCurrent(id);
		//getRedisEntry(id, (entry) => setRedisEntry(id, entry.current + 1, entry.total, entry.filename));
	}, 100);
}

router.get("/polling", function(req, res, next){
	getRedisEntry(req.session.id, (entry) => {
		if (!entry) return;
		if (entry.filename && entry.filename !== ""){
			res.send(entry.filename);
		}else{
			res.send(entry.current + "");
		}
	});
	
});
const setRedisEntry = (id, current, total, filename) => {
	const entry = new Object();
	entry.current = current;
	entry.total = total;
	entry.filename = filename;
	client.set(id, JSON.stringify(entry));
}
const getRedisEntry = (id, callback) => {
	client.get(id, function(error, result) {
		if (error) throw error;
		const res = JSON.parse(result);
		//console.log("current from db: " + res.current);
		callback(res);
	  });
}
const incrementCurrent = (id) =>{

	getRedisEntry(id, (entry) => {
		console.log("ID: " + id);
		const newCurrent = entry.current + 1;
		console.log("incrementing to " + newCurrent);
		setRedisEntry(id, newCurrent, entry.total, entry.filename);
	});
}
const setFileName = (id, filename) => {
	getRedisEntry(id, (entry) => setRedisEntry(id, entry.current, entry.total, filename))
}
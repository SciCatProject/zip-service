const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
    let jwt = "";
    let base = "";
    let file0 = "";
    let file1 = "";
    let file2 = "";
    try {
        const config = require('../local.config.json');
        jwt = config.jwt;
        base = config.base;
        file0 = config.files[0];
        file1 = config.files[1];
        file2 = config.files[2];

       }catch (e) {}//defaulting to empty strings
       res.render('test', {jwt, base, file0, file1, file2} );
});

module.exports = router;
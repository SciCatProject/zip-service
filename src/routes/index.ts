import express from "express";
export const router = express.Router();

router.get('/', function(req, res, next) {
    let jwt = "";
    let base = "";
    let file0 = "";  
    let file1 = "";
    let file2 = "";
    try {
        const config = require('../local.config.json');
        jwt = config.test_jwt;
        base = config.test_base;
        file0 = config.test_files[0];
        file1 = config.test_files[1];
        file2 = config.test_files[2];

       }catch (e) {}//defaulting to empty strings
    res.render('index', {jwt, base, file0, file1, file2} );
});

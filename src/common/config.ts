import fs = require('fs');

const configBuffer: string = fs.readFileSync('../config/config.json','utf8');


export const config: Record<string, any> = JSON.parse(configBuffer);


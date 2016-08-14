let DeployGithub = require('../../deploy-github.js');

DeployGithub.callback(()=>{
    console.log('complete');
}, __dirname);

DeployGithub.automatic();

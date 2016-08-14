let fs = require('fs');
let path = require('path');
let url = require('url');
let http = require('http');
let https = require('https');
let admzip = require('adm-zip');
let readline = require('readline');

let EventEmitter = require('events');
let events = new EventEmitter();

let Logger = log => {
    let now = new Date();
    let timeFormat = String();
    timeFormat += (String(now.getHours()).length > 1 ? now.getHours() : '0' + now.getHours());
    timeFormat += ':' + (String(now.getMinutes()).length > 1 ? now.getMinutes() : '0' + now.getMinutes());
    timeFormat += ':' + (String(now.getSeconds()).length > 1 ? now.getSeconds() : '0' + now.getSeconds()) + "";
    let defaultFormat = String.fromCharCode(0x1b) + "[34;1m" + "[%time%] " + String.fromCharCode(0x1b) + "[37;1m" + "%log%";
    console.log(defaultFormat.replace('%time%', timeFormat).replace('%log%', log));
}

let saveOptions = {};

class DeployGithub {
    static get START_CALLBACK_EVENT() {
        return "start_callback_event";
    }

    static get NEW_VERSION_DETECTED_EVENT() {
        return "new_version_detected_event";
    }

    static get ALREADY_HIGHEST_VERSION_EVENT() {
        return "already_highest_version_event";
    }

    static get PROJECT_DOWNLOAD_START_EVENT() {
        return "project_download_start_event";
    }

    static get PROJECT_DOWNLOAD_PROGRESS_EVENT() {
        return "project_download_progress_event";
    }

    static get PROJECT_DOWNLOAD_END_EVENT() {
        return "project_download_end_event";
    }

    static get PROJECT_EXTRACT_COMPLETE_EVENT() {
        return "project_extract_complete_event";
    }

    /**
     * @param {integer} waitTime
     * @param {string} branch
     * @param {string} repoUrl
     * @param {string} sourceFolderPath
     * @param {boolean} isNeedDefaultProcess
     */
    static automatic(waitTime, branch, repoUrl, sourceFolderPath, isNeedDefaultProcess) {
        if (sourceFolderPath === undefined)
            sourceFolderPath = path.join(process.argv[1], '../');

        if (isNeedDefaultProcess == true || isNeedDefaultProcess == undefined) {
            DeployGithub.on(DeployGithub.NEW_VERSION_DETECTED_EVENT,
                (eventInfo) => {
                    DeployGithub.getNewestGitHubCommit((message, committerName, commitDate) => {
                        let checkWaitTime = null;
                        if (typeof(saveOptions[`${eventInfo.repoUrl}:${eventInfo.branch}`]) != 'undefined')
                            checkWaitTime = saveOptions[`${eventInfo.repoUrl}:${eventInfo.branch}`][waitTime];

                        if (checkWaitTime === 0) {
                            DeployGithub.downloadWebProjectZip(eventInfo.repoUrl,
                                eventInfo.branch, eventInfo.sourceFolderPath);
                            return;
                        }

                        if (checkWaitTime == null) checkWaitTime = 10000; //milisecond

                        Logger('New updates of the application have been found at Github.');
                        Logger(`Repository URL: ${eventInfo.repoUrl}, Branch: ${eventInfo.branch}\r\n`);

                        Logger(`Installed Application Version: ${eventInfo.localVersion}`);
                        Logger(`Update available version of application: ${eventInfo.webVersion}\r\n`);

                        Logger('[Github commit Information]');
                        Logger(`Message: ${message}`);
                        Logger(`Comitter: ${committerName}`);
                        Logger(`CommitDate: ${commitDate}\r\n`);

                        Logger(`If you do not select, it will be launch ${(checkWaitTime/1000)} seconds after automatically.`);
                        Logger(`If want to update, please enter 'yes'.`);
                        Logger('(yes/no):');

                        let line = readline.createInterface({
                            input: process.stdin,
                            output: process.stdout
                        });

                        let timerKnock = setTimeout(() => {
                            grantedCalback();
                        }, checkWaitTime);

                        let grantedCalback = () => {
                            clearTimeout(timerKnock);
                            line.close();
                            DeployGithub.downloadWebProjectZip(eventInfo.repoUrl,
                                eventInfo.branch, eventInfo.sourceFolderPath);
                        };
                        let deniedCallback = () => {
                            clearTimeout(timerKnock);
                            line.close();
                            events.emit(DeployGithub.START_CALLBACK_EVENT, eventInfo);
                        };

                        line.on('line', function(input) {
                            switch (input.toLowerCase()) {
                                case 'y':
                                case 'yes':
                                    grantedCalback();
                                    break;
                                case 'n':
                                case 'no':
                                    deniedCallback();
                                    break;
                                default:
                                    Logger(`${input} is not correct, please type 'yes' or 'no'.`);
                                    break;
                            }
                        });
                    });
                });
            DeployGithub.on(DeployGithub.PROJECT_DOWNLOAD_START_EVENT,
                (eventInfo) => {
                    if (typeof(saveOptions[`${eventInfo.repoUrl}:${eventInfo.branch}`]['automatic']) == 'undefined')
                        return;

                    if (saveOptions[`${eventInfo.repoUrl}:${eventInfo.branch}`]['automatic'])
                        Logger(`START THE DOWNLOAD PROJECT FILE... (${eventInfo.repoUrl}:${eventInfo.branch})`);
                });
            DeployGithub.on(DeployGithub.PROJECT_DOWNLOAD_END_EVENT,
                (eventInfo) => {
                    if (typeof(saveOptions[`${eventInfo.repoUrl}:${eventInfo.branch}`]['automatic']) == 'undefined')
                        return;

                    if (saveOptions[`${eventInfo.repoUrl}:${eventInfo.branch}`]['automatic']) {
                        Logger(`START THE EXTRACT PROJECT ZIP... (${eventInfo.repoUrl}:${eventInfo.branch})`);
                        DeployGithub.extractProjectZip(eventInfo.repoUrl, eventInfo.branch, eventInfo.sourceFolderPath);
                    }
                });

            DeployGithub.on(DeployGithub.PROJECT_EXTRACT_COMPLETE_EVENT,
                (eventInfo) => {
                    if (typeof(saveOptions[`${eventInfo.repoUrl}:${eventInfo.branch}`]['automatic']) == 'undefined')
                        return;

                    if (saveOptions[`${eventInfo.repoUrl}:${eventInfo.branch}`]['automatic'])
                        Logger(`PROJECT UPDATE COMPLETE! (${eventInfo.repoUrl}:${eventInfo.branch})`);

                    events.emit(DeployGithub.START_CALLBACK_EVENT, eventInfo);
                });
        }

        let localGitInfo = DeployGithub.getLocalGitInfo(sourceFolderPath);
        if (localGitInfo.type != "git") return;

        if (repoUrl === undefined) repoUrl = localGitInfo.url;

        if (repoUrl[repoUrl.length - 1] != '/') repoUrl += '/';
        if (branch === undefined) branch = 'master';

        saveOptions[`${repoUrl}:${branch}`] = {
            waitTime: waitTime,
            automatic: true
        };

        let webGitInfoCallback = (webGitInfo) => {
            if (webGitInfo.type != "git") return;

            let eventInfo = {
                repoUrl: repoUrl,
                sourceFolderPath: sourceFolderPath,
                branch: branch,
                localVersion: localGitInfo.version,
                webVersion: webGitInfo.version
            };

            if (webGitInfo.version == localGitInfo.version || webGitInfo.version == null) {
                events.emit(DeployGithub.ALREADY_HIGHEST_VERSION_EVENT, eventInfo);
            } else {
                events.emit(DeployGithub.NEW_VERSION_DETECTED_EVENT, eventInfo);
            }
        };

        DeployGithub.getWebGitInfo(repoUrl, branch, webGitInfoCallback);
    }

    /**
     * @param {string} event
     * @param {function} listener
     */
    static on(event, listener) {
        events.on(event, listener);
    }

    /**
     * @param {function} listener
     * @param {string} dirname
     */
    static callback(listener, dirname) {
        let packageJson = require(path.join(dirname, 'package.json'));
        let url = null;

        if (typeof(packageJson.repository.url) !== 'undefined')
            url = packageJson.repository.url;

        if (url !== null) {
            if (url.split('git+').length > 1) url = url.split('git+')[1];
            if (url.split('.git').length > 1) url = url.split('.git')[0];
        }

        if (url[url.length - 1] != '/') url += '/';

        DeployGithub.on(DeployGithub.START_CALLBACK_EVENT, (eventInfo) => {
            if (eventInfo.repoUrl == url)
                listener(eventInfo);
        });
    }

    /**
     * @typedef {object} repoInfo
     * @property {string} type
     * @property {string} url
     *
     * @param {string} sourceFolderPath
     * @returns {repoInfo[]}
     */
    static getLocalGitInfo(sourceFolderPath) {
        if (sourceFolderPath === undefined)
            sourceFolderPath = path.join(process.argv[1], '../');

        let packageJsonPath = path.join(sourceFolderPath, '/package.json');

        let type = '',
            url = '',
            version = '';

        try {
            let packageJson = require(packageJsonPath);

            if (typeof(packageJson.repository) != "undefined" &&
                typeof(packageJson.repository.type) != "undefined" &&
                typeof(packageJson.repository.url) != "undefined") {
                type = packageJson.repository.type;
                url = packageJson.repository.url;
            }
            if (typeof(packageJson.version) != "undefined")
                version = packageJson.version;

            if (url != null) {
                if (url.split('git+').length > 1) url = url.split('git+')[1];
                if (url.split('.git').length > 1) url = url.split('.git')[0];
            }
        } catch (e) {}

        return {
            type: type.toLowerCase(),
            url: url,
            version: version
        };
    }

    /**
     * @callback webGitInfoCallback
     * @param {Object} webGitInfo
     */
    /**
     * @param {string} repoUrl
     * @param {string} branch
     * @param {webGitInfoCallback} callback
     */
    static getWebGitInfo(repoUrl, branch, callback) {
        DeployGithub.getWebPackageJson(repoUrl, branch, (packageJson) => {
            let type = '',
                version = '';
            if (typeof(packageJson.repository) != "undefined" &&
                typeof(packageJson.repository.type) != "undefined") {
                type = packageJson.repository.type;
            }
            if (typeof(packageJson.version) != "undefined")
                version = packageJson.version;

            callback({
                type: type.toLowerCase(),
                version: version
            });
        });
    }

    /**
     * @callback packageJsonCallback
     * @param {Object} packageJson
     */
    /**
     * @param {string} repoUrl
     * @param {string} branch
     * @param {packageJsonCallback} callback
     */
    static getWebPackageJson(repoUrl, branch, callback) {
        let type = '',
            version = '';

        if (repoUrl[repoUrl.length - 1] != '/') repoUrl += '/';
        let packageJsonUrl = url.resolve(repoUrl, `${branch}/package.json`);
        let parsedPackageJsonUrl = url.parse(packageJsonUrl);
        let protocol = null;
        switch (parsedPackageJsonUrl.protocol) {
            case 'http:':
                protocol = http;
                break;
            case 'https:':
                protocol = https;
                break;
        }
        parsedPackageJsonUrl.host = 'raw.githubusercontent.com';
        let packageJson = '';

        if (protocol === null) {
            callback(null);
        } else {
            protocol.get(url.format(parsedPackageJsonUrl), (response) => {
                response.on('data', (chunk) => {
                    packageJson += chunk;
                });
                response.on('end', () => {
                    callback(JSON.parse(packageJson)); //TODO
                });
            });
        }
    }

    /**
     * @param {string} repoUrl
     * @param {string} branch
     * @param {string} sourceFolderPath
     */
    static downloadWebProjectZip(repoUrl, branch, sourceFolderPath) {
        if (repoUrl[repoUrl.length - 1] != '/') repoUrl += '/';
        let projectZipUrl = url.resolve(repoUrl, `zip/${branch}`);
        let parsedProjectZipUrl = url.parse(projectZipUrl);
        let protocol = null;

        if (fs.existsSync(path.join(sourceFolderPath, `_${branch}.zip`)))
            fs.unlinkSync(path.join(sourceFolderPath, `_${branch}.zip`));

        switch (parsedProjectZipUrl.protocol) {
            case 'http:':
                protocol = http;
                break;
            case 'https:':
                protocol = https;
                break;
        }

        parsedProjectZipUrl.host = 'codeload.github.com';
        if (protocol !== null) {
            protocol.get(url.format(parsedProjectZipUrl), (response) => {
                let eventInfo = {
                    repoUrl: repoUrl,
                    sourceFolderPath: sourceFolderPath,
                    branch: branch
                };

                events.emit(DeployGithub.PROJECT_DOWNLOAD_START_EVENT, eventInfo);

                let file = fs.createWriteStream(path.join(sourceFolderPath, `_${branch}.zip`));
                let contentLength = parseInt(response.headers['content-length'], 10);
                let currentLength = 0;

                response.pipe(file);

                response.on('data', (chunk) => {
                    currentLength += chunk.length;
                    let percentage = (100.0 * (currentLength / contentLength)).toFixed(2);

                    events.emit(DeployGithub.PROJECT_DOWNLOAD_PROGRESS_EVENT,
                        percentage, eventInfo);
                });

                response.on('end', () => {
                    file.end();
                });

                file.on('finish', () => {
                    events.emit(DeployGithub.PROJECT_DOWNLOAD_END_EVENT, eventInfo);
                });
            });
        }
    }

    /**
     * @param {string} repoUrl
     * @param {string} branch
     * @param {string} sourceFolderPath
     */
    static extractProjectZip(repoUrl, branch, sourceFolderPath) {
        let zip = new admzip(path.join(sourceFolderPath, `_${branch}.zip`));
        let zipEntries = zip.getEntries(); // an array of ZipEntry records
        zip.extractEntryTo(zipEntries[0], sourceFolderPath, false, true);
        fs.unlink(path.join(sourceFolderPath, `_${branch}.zip`));

        let eventInfo = {
            repoUrl: repoUrl,
            sourceFolderPath: sourceFolderPath,
            branch: branch
        }
        events.emit(DeployGithub.PROJECT_EXTRACT_COMPLETE_EVENT, eventInfo);
    }

    /**
     * @callback newestCommitCallback
     * @param {string} message
     * @param {string} committerName
     * @param {string} commitDate
     */
    /**
     * @param {newestCommitCallback} callback
     */
    static getNewestGitHubCommit(callback) {
        DeployGithub.getGitHubCommits((body) => {
            callback(body[0].commit.message, body[0].commit.committer.name, body[0].commit.committer.date);
        });
    }

    /**
     * @callback commitDataCallback
     * @param {Object} body
     */
    /**
     * @param {commitDataCallback} callback
     */
    static getGitHubCommits(callback) {
        let options = {
            hostname: 'api.github.com',
            port: 443,
            path: '/repos/organization/minejs/commits',
            method: 'GET',
            headers: {
                'user-agent': 'DeployGithub'
            }
        };

        let body = '';
        let request = https.request(options, (response) => {
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on("end", function() {
                body = JSON.parse(body);
                callback(body);
            });
        });
        request.end();
    }
}

module.exports = DeployGithub;

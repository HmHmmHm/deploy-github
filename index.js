let fs = require('fs');
let path = require('path');
let url = require('url');
let http = require('http');
let https = require('https');
let admzip = require('adm-zip');

let EventEmitter = require('events');
let events = new EventEmitter();

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

    /**
     * @param {string} repoUrl
     * @param {string} sourceFolderPath
     * @param {boolean} isNeedDefaultProcess
     * @param {string} branch
     */
    static automatic(repoUrl, sourceFolderPath, isNeedDefaultProcess, branch) {
        if (isNeedDefaultProcess == true || isNeedDefaultProcess == undefined) {
            DeployGithub.on(DeployGithub.NEW_VERSION_DETECTED_EVENT,
                (eventInfo) => {
                    //TODO
                });
        }

        let localGitInfo = DeployGithub.getLocalGitInfo(sourceFolderPath);
        if (localGitInfo.type != "git") return;

        if (repoUrl === undefined) repoUrl = localGitInfo.url;
        if (branch === undefined) branch = 'master';

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
     */
    static callback(listener) {
        DeployGithub.on(DeployGithub.START_CALLBACK_EVENT, listener);
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
                url = '',
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
                    callback(packageJson);
                });
            });
        }
    }

    /**
     * @param {string} repoUrl
     * @param {string} branch
     * @param {string} sourceFolderPath
     */
    static downloadWebProjectZip(repoUrl, branch, sourceFolderPath, callback) {
        let projectZipUrl = url.resolve(repoUrl, `archive/${branch}.zip`);
        let parsedProjectZipUrl = url.parse(projectZipUrl);
        let protocol = null;
        switch (parsedProjectZipUrl.protocol) {
            case 'http:':
                protocol = http;
                break;
            case 'https:':
                protocol = https;
                break;
        }
        parsedProjectZipUrl.host = 'raw.githubusercontent.com';

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
                let currentPercentage = 0;

                response.pipe(file);

                response.on('data', (chunk) => {
                    currentPercentage += chunk.length;
                    percentage = (100.0 * (currentPercentage / contentLength)).toFixed(2);

                    events.emit(DeployGithub.PROJECT_DOWNLOAD_PROGRESS_EVENT,
                        currentPercentage, eventInfo);
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
        let zip = new admzip(name);
        zip.extractAllTo(sourceFolderPath, true);
        fs.unlink(path.join(sourceFolderPath, `${branch}.zip`));
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
        DeployGithub.getGitHubCommits((body)=>{
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

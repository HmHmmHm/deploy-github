# deploy-github

deploy-github is manage automatic update of project using github.

## Introducion

```
deploy-github is an automatic updater module,
it makes possible to help for keep the  distributed
node project to users to always have the latest version.
It comes automatically receive the latest version
information on GitHub, Basic functions (automatically
asks the user whether to update execution) is also built in.
```

## How to use deploy-github?

- type `npm install deploy-github`
- and type your main js file highest `let DeployGithub = require('deploy-github');`
- makes callback for after update complete run `DeployGithub.callback( ()=>{ /* DO /*} );`
- and type `DeployGithub.automatic();`
- so, yes it complete! now your project can be automatic update using github!


    deploy-github using package.json repository data
    so doesn't need to write complex updater code on the every project.

![Showcase](http://i.imgur.com/mfOgjeo.png)

## Example

<https://github.com/HmHmmHm/deploy-github/blob/master/example/DoUpdate/app.js>

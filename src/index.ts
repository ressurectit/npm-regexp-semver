import * as commandLineArgs from "command-line-args";
import * as fs from "fs";
import * as path from "path";
import * as childProcess from "child_process";

export interface IHelpObject
{
    help?: boolean;
    config?: string;
    pre?: boolean;
    buildNumber?: boolean;
    majorNumber?: boolean;
    specificVersion?: string;
    preReleaseSuffix?: string;
}

export function processArguments(): IHelpObject
{
    var cli = commandLineArgs(
    [
        { name: "help", alias: "h", type: Boolean, description: "Displays help for this command line tool." },
        { name: "config", alias: "c", type: String, description: "Path to configuration file that contains definition of requested replaces.", typeLabel: "<pathToConfig>", defaultOption: true },
        { name: "pre", alias: "p", type: Boolean, description: "Indication that version should be set to prerelease version." },
        { name: "buildNumber", alias: "b", type: Boolean, description: "Indicates that build number of version should be incremented." },
        { name: "majorNumber", alias: "m", type: Boolean, description: "Indicates that major number of version should be incremented." },
        { name: "specificVersion", alias: "v", type: String, description: "Specific version that is going to be set. If this is set overrides any other version parameter.", typeLabel: "<version>" },
        { name: "preReleaseSuffix", alias: "s", type: String, description: "Suffix that will be added to version number. If not specified 'pre' is used. It is not used without 'pre' parameter.", defaultValue: "alpha", typeLabel: "<suffix>"},
    ]);

    var args: IHelpObject = <IHelpObject>cli.parse();

    if(args.help)
    {
        console.log(cli.getUsage(
        {
            title: "npm-regexp-semver (nrs)",
            description: `Application that allows updating versions using semver version found in files using regexp.`,
            examples:
            [
                {
                    example: "> ",
                    description: ''
                }
            ]
        }));

        process.exit();
    }

    return args;
}

/**
 * Processor that is capable of processing files that should contain versions
 */
export class VersionsProcessor
{
    //######################### private fields #########################
    private _registeredModules: string[] = [];
    private _packageName: string;
    private _content: string;
    private _projectPath: string;

    //######################### constructor #########################
    constructor(private _bundlePath: string)
    {
    }

    //######################### public methods #########################
    findRegisters(): BundleProcessor
    {
        this._readFile();

        var regex = /System\.register\("(.*?)"/g;
        var match;

        while((match = regex.exec(this._content)) != null)
        {
            var moduleName: string = match[1];

            if(moduleName.indexOf(this._packageName) == 0)
            {
                continue;
            }

            this._registeredModules.push(moduleName);

            console.log(`Processed module name '${moduleName}'`);
        }

        return this;
    }

    updateModuleNames(): void
    {
        for(var x = 0; x < this._registeredModules.length; x++)
        {
            var moduleNameRegex = new RegExp(`System\\.register\\("${this._registeredModules[x]}"`, "g");

            this._content = this._content.replace(moduleNameRegex, `System.register("${this._packageName}/${this._registeredModules[x]}"`);

            var dependencyRegex = new RegExp(`(System\\.register\\(".*?",\\s?\\[.*?)"${this._registeredModules[x]}"`, "g");

            this._content = this._content.replace(dependencyRegex, `$1"${this._packageName}/${this._registeredModules[x]}"`);
        }

        this._writeFile();
    }

    validateBundle(): BundleProcessor
    {
        try
        {
            if(!fs.statSync(this._bundlePath).isFile())
            {
                console.error(`'${this._bundlePath}' is not a file!`);

                process.exit(1);
            }
        }
        catch (error)
        {
            console.error(`There is no '${this._bundlePath}'. Original ${error}`);

            process.exit(1);
        }

        try
        {
            this._projectPath = path.join(process.cwd(), "package.json");

            if(!fs.statSync(this._projectPath).isFile())
            {
                console.error(`'${this._projectPath}' is not a file!`);

                process.exit(1);
            }
        }
        catch (error)
        {
            console.error(`There is no '${this._projectPath}'. Original ${error}`);

            process.exit(1);
        }

        console.log(`Bundle file '${this._bundlePath}' exists.`);
        console.log(`Package.json file '${this._projectPath}' exists.`);

        return this;
    }

    getPackageNames(): BundleProcessor
    {
        //TODO: add possibility to create relative hierarchy within module
        //this._packageName = path.basename(process.cwd());
        var project = require(this._projectPath);
        this._packageName = project.name;

        console.log(`Package name is '${this._packageName}'`);

        return this;
    }

    //######################### private methods #########################
    private _readFile(): void
    {
        try
        {
            this._content = fs.readFileSync(this._bundlePath, 'utf8');
        }
        catch(error)
        {
            console.error(`Unexpected error occured! Original ${error}`);

            process.exit(1);
        }
    }

    private _writeFile(): void
    {
        try
        {
            fs.writeFileSync(this._bundlePath, this._content, 'utf8');
        }
        catch(error)
        {
            console.error(`Unexpected error occured! Original ${error}`);

            process.exit(1);
        }

        console.log("Bundle successfuly updated.");
    }
}
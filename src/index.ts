import * as commandLineArgs from "command-line-args";
import * as fs from "fs";
import * as path from "path";
import * as childProcess from "child_process";
import * as Finder from 'fs-finder';
import * as semver from "semver";

export interface IHelpObject
{
    help?: boolean;
    config?: string;
    pre?: boolean;
    buildNumber?: boolean;
    majorNumber?: boolean;
    ignorePrefix?: string;
    specificVersion?: string;
    preReleaseSuffix?: string;
}

interface IConfigItem
{
    inputFilesPattern: string[];
    searchInPath?: string[];
    searchFromPath?: string[];
    searchForPattern: string;
    replaceWith: string;
    isVersionReplaceSource?: boolean;
}

interface IConfig extends Array<IConfigItem>
{
}

export function processArguments(): IHelpObject
{
    var cli = commandLineArgs(
    [
        { name: "help", alias: "h", type: Boolean, description: "Displays help for this command line tool." },
        { name: "config", alias: "c", type: String, description: "Relative path to configuration file that contains definition of requested replaces.", typeLabel: "<pathToConfig>", defaultOption: true },
        { name: "pre", alias: "p", type: Boolean, description: "Indication that version should be set to prerelease version." },
        { name: "buildNumber", alias: "b", type: Boolean, description: "Indicates that build number of version should be incremented." },
        { name: "majorNumber", alias: "m", type: Boolean, description: "Indicates that major number of version should be incremented." },
        { name: "ignorePrefix", alias: "i", type: String, description: "Version prefix regular expression pattern. This prefix is not part of semver version and will be ignored during version change.", typeLabel: "<prefix>" },
        { name: "specificVersion", alias: "v", type: String, description: "Specific version that is going to be set. If this is set overrides any other version parameter.", typeLabel: "<version>" },
        { name: "preReleaseSuffix", alias: "s", type: String, description: "Suffix that will be added to version number. If not specified 'pre' is used. It is not used without 'pre' parameter.", defaultValue: "alpha", typeLabel: "<suffix>"},
    ]);

    var args: IHelpObject = <IHelpObject>cli.parse();

    if(args.help)
    {
        console.log(cli.getUsage(
        {
            title: "npm-regexp-semver (nrs)",
            description:
`Application that allows updating versions using semver version found in files using regexp.
You have to specify one of 'searchInPath', 'searchFromPath'.

If no config is specified default config named 'nrs.config.json' will be used.;

Config format:
[
    {
        inputFilesPattern: "arrayOfRelativePathsWithWildcards",
        searchInPath: "arrayOfPathsThatAreSearchedInNonRecursive",
        searchFromPath: "arrayOfPathsThatAreSearchedInRecursive",
        searchForPattern: "javascriptRegexpSearchPattern",
        replaceWith: "replaceWithPatterWithVersionVariable'\${version}'",
        isVersionReplaceSource: optionalBooleanParameterIndicatingSourceVersionForReplace
    },
    .
    .
    .
    {
        "inputFilesPattern": ["package.json"],
        "searchForPattern": "\"version\": \"(.*?)\",",
        "replaceWith": "\"version\": \"\${version}\",",
        "isVersionReplaceSource": true
    }
]
`,
            examples:
            [
                {
                    example: "> nrs",
                    description: 'Updates versions using configuration from file "nrs.config.json", updates minor version 1.2.3 => 1.3.0'
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
    private _configPath: string = "";
    private _configuration: IConfig = null;
    private _newVersion: string = "";

    //######################### constructor #########################
    constructor(private _config: IHelpObject)
    {
        this._configPath = path.join(process.cwd(), (_config.config || "nrs.config.json"));
    }

    //######################### public methods #########################
    public validateConfig(): VersionsProcessor
    {
        console.log("Validating provided parameters");

        try
        {
            if(!fs.statSync(this._configPath).isFile())
            {
                console.error(`'${this._configPath}' is not a file!`);

                process.exit(1);
            }
        }
        catch (error)
        {
            console.error(`There is no '${this._configPath}'. Original ${error}`);

            process.exit(1);
        }

        this._configuration = require(this._configPath);

        if(!(this._configuration instanceof Array))
        {
            console.error(`Content '${this._configPath}' is not a proper format, it is not an array!`);

            process.exit(1);
        }

        console.log("Items that does not contain 'inputFilesPattern' or 'searchForPattern' or 'replaceWith' or at least one of 'searchInPath' or 'searchFromPath' are skipped.");
        this._configuration = this._configuration.filter(itm => !!itm.inputFilesPattern &&
                                                                !!itm.replaceWith &&
                                                                !!itm.searchForPattern &&
                                                                itm.inputFilesPattern instanceof Array &&
                                                                itm.inputFilesPattern.length > 0 && 
                                                                (!!itm.searchInPath || !!itm.searchFromPath));

        if(this._configuration.length < 1)
        {
            console.error(`Content '${this._configPath}' is an empty array!`);

            process.exit(1);
        }

        return this;
    }

    public findSourceVersion(): VersionsProcessor
    {
        let sourceVersion = this._configuration[0];
        let tmp = this._configuration.filter(itm => itm.isVersionReplaceSource);

        if (this._config.specificVersion) 
        {
            console.log(`Specified version is '${this._config.specificVersion}'`);

            this._newVersion = this._config.specificVersion;
            return this;
        }

        if(tmp.length > 0)
        {
            sourceVersion = tmp[0];
        }

        let files = [];
        
        if(sourceVersion.searchInPath && sourceVersion.searchInPath instanceof Array && sourceVersion.searchInPath.length > 0)
        {
            console.log(`Searching for source version files '${sourceVersion.inputFilesPattern[0]}' in '${sourceVersion.searchInPath[0]}'`);

            files = Finder.in(path.join(process.cwd(), sourceVersion.searchInPath[0])).exclude("node_modules").findFiles(sourceVersion.inputFilesPattern[0]);
        }
        else if(sourceVersion.searchFromPath && sourceVersion.searchFromPath instanceof Array && sourceVersion.searchFromPath.length > 0)
        {
            console.log(`Searching for source version files '${sourceVersion.inputFilesPattern[0]}' from '${sourceVersion.searchFromPath[0]}'`);
            
            files = Finder.from(path.join(process.cwd(), sourceVersion.searchFromPath[0])).exclude("node_modules").findFiles(sourceVersion.inputFilesPattern[0]);
        }

        if(files.length < 1)
        {
            console.error(`There is no file found with pattern '${sourceVersion.inputFilesPattern[0]}'.`);

            process.exit(1);
        }

        let content = this._readFile(files[0]);
        let regexp = new RegExp(sourceVersion.searchForPattern, "g");
        let result = regexp.exec(content);

        if(!result || result.length < 1)
        {
            console.error(`There is no 1 group that captures version number in pattern '${sourceVersion.searchForPattern}'.`);

            process.exit(1);
        }

        console.log(`Current version is '${result[1]}'`);
        this._newVersion = this._updateVersion(result[1]);
        console.log(`Next version will be '${this._newVersion}'`);

        return this;
    }

    updateVersions(): void
    {
        this._configuration.forEach(config =>
        {
            config.inputFilesPattern.forEach(filePattern =>
            {
                let files = [];
                
                if(config.searchInPath && config.searchInPath instanceof Array && config.searchInPath.length > 0)
                {
                    config.searchInPath.forEach(dir =>
                    {
                        Finder.in(path.join(process.cwd(), dir)).exclude("node_modules").findFiles(filePattern).forEach(foundFile =>
                        {
                            files.push(foundFile);
                        });
                    });
                }
                
                if(config.searchFromPath && config.searchFromPath instanceof Array && config.searchFromPath.length > 0)
                {
                    config.searchFromPath.forEach(dir =>
                    {
                        Finder.from(path.join(process.cwd(), dir)).exclude("node_modules").findFiles(filePattern).forEach(foundFile =>
                        {
                            files.push(foundFile);
                        });
                    });
                }
                
                files.forEach(file =>
                {
                    console.log(`Processing file '${file}'.`);
                    
                    let content = this._readFile(file);
                    content = content.replace(new RegExp(config.searchForPattern, "g"), config.replaceWith.replace("${version}", this._newVersion));
                    this._writeFile(file, content);
                });
            });
        });
    }

    //######################### private methods #########################
    private _readFile(path: string): string
    {
        try
        {
            return fs.readFileSync(path, 'utf8');
        }
        catch(error)
        {
            console.error(`Unexpected error occured! Original ${error}`);

            process.exit(1);
        }
    }

    private _writeFile(path: string, content: string): void
    {
        try
        {
            fs.writeFileSync(path, content, 'utf8');
        }
        catch(error)
        {
            console.error(`Unexpected error occured! Original ${error}`);

            process.exit(1);
        }
    }
    
    private _updateVersion(version: string): string
    {
        let preVersion = /\d+\.\d+\.\d+-.*?/g.test(version);
        
        if(this._config.pre && preVersion)
        {
            return semver.inc(version, "pre", this._config.preReleaseSuffix)
        }
        
        var identifier: string = "";
        
        if(this._config.pre)
        {
            identifier = "pre";
        }
        
        if(this._config.buildNumber)
        {
            identifier += "patch";
        }
        else if(this._config.majorNumber)
        {
            identifier += "major";
        }
        else
        {
            identifier += "minor";
        }
        
        return semver.inc(version, identifier, this._config.preReleaseSuffix)
    }
}
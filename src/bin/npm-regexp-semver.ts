#!/usr/bin/env node

import {IHelpObject, processArguments, BundleProcessor} from "../index";

var args: IHelpObject = processArguments();

if(!args.bundle || args.bundle.length < 1)
{
    console.error("Parameter bundle is required!");
    
    process.exit(1);
}

var processor: BundleProcessor = new BundleProcessor(args.bundle);
processor.validateBundle()
    .getPackageNames()
    .findRegisters()
    .updateModuleNames();

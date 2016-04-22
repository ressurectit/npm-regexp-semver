/// <binding ProjectOpened='copy-binaries' />
var gulp = require("gulp"),
    through2 = require('through2');
    
function logCopied()
{
    return through2.obj(function(vinyl, enc, callback)
    {
        console.log("Copying follow file: '" + vinyl.path + "'");
        this.push(vinyl);

        callback();
    });
}

gulp.task("copy-semver", function()
{
    return gulp.src("node_modules/ng2-tstypings/tsTypings/semver.d.ts")
        .pipe(logCopied())
        .pipe(gulp.dest("tsTypings"));
});

gulp.task("copy-command-line-args", function()
{
    return gulp.src("node_modules/ng2-tstypings/tsTypings/command-line-args.d.ts")
        .pipe(logCopied())
        .pipe(gulp.dest("tsTypings"));
});

gulp.task("copy-command-line-usage", function()
{
    return gulp.src("node_modules/ng2-tstypings/tsTypings/command-line-usage.d.ts")
        .pipe(logCopied())
        .pipe(gulp.dest("tsTypings"));
});

gulp.task("copy-fs-finder", function()
{
    return gulp.src("node_modules/ng2-tstypings/tsTypings/fs-finder.d.ts")
        .pipe(logCopied())
        .pipe(gulp.dest("tsTypings"));
});

gulp.task("copy-tstypings", 
          ["copy-semver",
           "copy-command-line-args",
           "copy-fs-finder",
           "copy-command-line-usage"], 
          function(cb)
{
    console.log("TsTypings have been copied.");
    
    cb();
});
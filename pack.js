#!/usr/bin/env node

const path = require('path');
const fs = require ('fs');

const fontPaths = [];


function main(args){
    args.overwrite = args.overwrite === undefined || args.overwrite === false ? false : true;
    args.inline = args.inline === undefined || args.inline === false ? false : true;

    // Get Input Dir
    if (!args.i){ 
        console.log(`ERR: Input path required. Use -i [inputpath]`)
        process.exit(1)
    }
    const inputPath = path.resolve(args.i)
    if (!fs.existsSync(inputPath)){ throw `Path not found ${args.i}` }
    const inputDir = path.dirname(inputPath);
    console.log('Compiling ' + inputPath);

    // Get Output Dir
    let outputPath = null;
    if (args.o){
        outputPath = path.resolve(args.o);
        fs.mkdirSync(outputPath, { recursive: true });
        args.overwrite = false;
    } else if (args.overwrite){
        args.overwrite = true;
        outputPath = inputDir;
    } else {
        console.log(`ERR: Output path required. Use -o [outputpath] or -overwrite`)
        process.exit(1)
    }
    console.log('Outputting to ' + outputPath);

    // Get Original HTML
    const originalHTML = fs.readFileSync(inputPath,'utf-8');

    // Get Head
    const originalHead = extractHead(originalHTML);
    
    // Get All Tags
    let { tags, favs, fonts} = parseHead(originalHead,inputDir);
    if (args.inline){
        console.log('Placing all resources inline');
        tags.forEach(t=>{ t.buildTo = 'inline' });
    }
    
    // Replace Favicons
    let newHeadText = replaceFavicons(favs,originalHead,inputDir);

    // Compile Fonts
    if (fonts){
        newHeadText = compileFonts(fonts,inputDir,newHeadText)
    }

    // Read JS/CSS Files
    tags = readFiles(tags, inputDir);
  
    // Replace inline tags & fonts
    newHeadText = buildInline(tags,newHeadText);
    
    // Merge Files
    newHeadText = mergeFiles(tags,newHeadText, outputPath);

    // Write HTML Output
    const htmlOutPath = path.resolve(outputPath, path.basename(inputPath));
    const newHTML = originalHTML.replace(originalHead,newHeadText).replace(/^\s*[\r\n]/gm, '');
    console.log('Writing Compiled HTML to ' + htmlOutPath)
    fs.writeFileSync(htmlOutPath, newHTML)

    // Clean Dir
    if (args.overwrite){
        const oldFiles = tags.filter(t=>{ return t.path && fs.existsSync(t.path) }).map(t=>{ return t.path });
        console.log(`Removing ${oldFiles.length} compiled files`)
        // Compliled Favicons
        cleanFiles(favs.map(f=>{ return path.resolve(inputDir,f.file) }));
        // Compiled CSS/JS
        cleanFiles(oldFiles);
        // Compiled Fonts
        console.log(`Removing ${fontPaths.length} font files`);
        cleanFiles(fontPaths);
        cleanFiles([fonts.path]);
        cleanDir(path.dirname(fonts.path));
        // Empty Folders
        const folders = [...new Set( oldFiles.map(f=>{ return path.dirname(f) }) )];
        console.log(`Removing empty folders`); 
        folders.forEach(f=>{ cleanDir(f) });
        
    }
    console.log('Done')
}

//////

function extractHead(html){
    const headTagRegex = /<head.*?>([\s\S]*?)<\/head>/i;
    const match = headTagRegex.exec(html);

    if (match && match[1]) {
        return match[1];
    } else {
        return null;
    }
}

function parseHead(headText,baseDir){
    const favs = [];
    var fonts = {};
    let tags = [];
    // Get Scripts
    const scriptTagRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
    (headText.match(scriptTagRegex) || []).forEach(s=>{ tags.push({type: 'script', tag: s}) });

    // Get css
    const cssRegex = /<link\s+[^>]*?rel\s*=\s*["']stylesheet["'][^>]*?>/gi;
    (headText.match(cssRegex) || []).forEach(c=>{ tags.push({type: 'css', tag: c})});
    

    // Get Build and File Path
    const buildRgx = /build\s*=\s*['"]([^'"]*)['"][^>]*>/i;
    const srcRgx = {
        script:/src\s*=\s*['"]([^'"]+)['"]/i,
        css: /href\s*=\s*['"]([^'"]+)['"]/i
    }
    for (let i=tags.length-1; i>=0;i--){
        tags[i].buildTo = tags[i].tag.match(buildRgx) ? tags[i].tag.match(buildRgx)[1] : null;
        if (!tags[i].buildTo){ 
            tags.splice(i,1);
            continue;
        }
        const fileMatch = tags[i].tag.match(srcRgx[tags[i].type]);
        tags[i].file = fileMatch && fileMatch[1] ? fileMatch[1] : null;
        tags[i].path = path.resolve(baseDir,tags[i].file);

        if (tags[i].buildTo === 'fonts'){
            fonts = tags[i];
            tags.splice(i,1);
        }
    }

    // Get Favicon
    const faviconRegex = /<link\s+[^>]*?rel\s*=\s*["']\s*icon\s*["'][^>]*?>/i;
    const faviconTag = headText.match(faviconRegex) ? headText.match(faviconRegex)[0] : null;

    if (faviconTag){
        const faviconSrc = faviconTag.match(srcRgx.css) ? faviconTag.match(srcRgx.css)[1] : null;
        if (faviconSrc && faviconSrc.length < 100){
            favs.push({ tag: faviconTag, file: faviconSrc})
        }
    }

    return { tags, favs, fonts };
}

function replaceFavicons(favs,headText,baseDir){
    favs.forEach(f=>{
        console.log('Adding b64 favicon ' + f.file);
        const typeMatch = f.tag.match(/type\s*=\s*['"]([^'"]+)['"]/i);
        const mime = typeMatch ? typeMatch[1] : null;
        const favPath = path.resolve(baseDir,f.file);
        const fileData = fs.readFileSync(favPath)
       const dataURL = `data:${mime};base64,${Buffer.from(fileData).toString('base64')}`;

        const newTag = f.tag.replace(/href\s*=\s*['"]([^'"]+)['"]/, `href="${dataURL}"`);
        headText = headText.replace(f.tag,newTag)
    });
    return headText;
}

function readFiles(tags,baseDir){
    for (let i=0; i<tags.length; i++){
        if (!fs.existsSync(tags[i].path)){
            console.log('WARNING: MISSING FILE ' + tags[i].path);
            continue;
        }
        tags[i].fileText = fs.readFileSync(tags[i].path, 'utf-8')
    }
    return tags;
}

function compileFonts(fontTag,baseDir,headText){
    console.log('Compiling fonts')
    const fontFolder = path.dirname(path.resolve(baseDir,fontTag.file));

        const files = fs.readdirSync(fontFolder);
        const fontFiles = files.filter(file => /\.(ttf|woff|woff2|otf)$/.test(file));
        let cssContent = '';

        for (const file of fontFiles) {
            console.log('\t' + file)
            const fontPath = path.join(fontFolder, file);
            const fontData = fs.readFileSync(fontPath);
            const fontStr = fontData.toString('base64');
            const fontExt = path.extname(file).substring(1)
            const mimeType = `font/${fontExt}`

            cssContent += (
`@font-face {
    font-family: '${path.parse(file).name}';
    src: url(data:${mimeType};charset=utf-8;base64,${fontStr});
}\n`
            );

            fontPaths.push(fontPath);
        }
        headText = headText.replace(fontTag.tag,`<style>\n${cssContent}\n</style>`)
        return headText;
}

function buildInline(tags,headTxt){
    console.log('Adding inline files')
    const inlineTags = tags.filter(t=>{ return t.buildTo === 'inline'});
    inlineTags.forEach(t=>{
        console.log('\t' + t.type + ' ' + t.file);
        const htmlTag = t.type === 'script' ? `script` : 'style';
        const newTag = `<${htmlTag} from="${path.basename(t.file)}">\n${t.fileText}\n</${htmlTag}>`;
        headTxt = headTxt.replace(t.tag,newTag)
    })
    return headTxt;
}


function mergeFiles(tags,headText, outputPath){
    console.log('Merging Files')
    const mergeTags = tags.filter(t=>{ return t.buildTo && t.buildTo !== 'inline' && t.buildTo !== 'fonts' && t.type !== 'icon'});
    
    // Merge Strings
    const builtFiles = {};
    for (let i=0; i<mergeTags.length; i++){
        const bTo = mergeTags[i].buildTo;
        if (!builtFiles[bTo]){
            builtFiles[bTo] = {text: [], tags: [], newTag: '', type: mergeTags[i].type, files: [] };
        }
        builtFiles[bTo].text.push(mergeTags[i].fileText);
        builtFiles[bTo].tags.push(mergeTags[i].tag);
        builtFiles[bTo].files.push(mergeTags[i].file);
    }
    
    // Build New Tag
    Object.keys(builtFiles).forEach(b=>{
        console.log(`\t${b} [${builtFiles[b].tags.length}]: ${builtFiles[b].files.join('   ')}`)
        if (builtFiles[b].type === 'script'){
            const isAsync = builtFiles[b].tags.find(t=>{ return t.match(/ async/i) }) ? ' async ' : '';
            const isDefer = builtFiles[b].tags.find(t=>{ return t.match(/ defer/i) }) ? ' defer' : '';
            builtFiles[b].newTag = `<script src="./${b}"${isAsync}${isDefer}></script>`;
        } else {        
            builtFiles[b].newTag = `<link rel="stylesheet" href="./${b}">`;
        }
    })

    // Write Files
    Object.keys(builtFiles).forEach(b=>{
        const filePath = path.resolve(outputPath,b);
        fs.writeFileSync(filePath, builtFiles[b].text.join('\n'));
    })

    // Replace Tags
    Object.keys(builtFiles).forEach(b=>{
        headText = headText.replace(builtFiles[b].tags[0], builtFiles[b].newTag);
        for (let i=0; i<builtFiles[b].tags.length; i++){
            headText = headText.replace(builtFiles[b].tags[i], '')
        }
    })
    return headText;
}

function cleanFiles(files){
    files.forEach(f=>{
        if (fs.existsSync(f) && !fs.lstatSync(f).isDirectory()){
            fs.unlinkSync(f);
        }
    })
}

function cleanDir(dirName){
    try{
        fs.rmdirSync(dirName);
        cleanDir(path.dirname(dirName));
    } catch(e){
        return
    }
}

function parseArgs(){
    var args = {};

    for (let i=0;i<process.argv.length; i++){
        if (process.argv[i][0] === '-'){
            args[process.argv[i].replace('-','')] = null;
            if (process.argv[i+1] && process.argv[i+1][0] !== '-'){
                args[process.argv[i].replace('-','')] = process.argv[i+1];
                i += 1
            }
        }
    }
    return args;
}


const userArgs = parseArgs();
main(userArgs)

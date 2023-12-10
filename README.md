# Introduction 

A is a dead simple command line tool for for bundling source files referenced in an html page.

Merges CSS and JS files. Converts fonts and favicon files to base64 and embeds them inline.

Current iteration supports CSS, JS, Fonts, and favicons.

# Usage

Step #1: Set a "build" attribute in your html file
Step #2: Run the command line tool to merge files

### HTML Setup

In your HTML, include a "build" attribute in script or link tags. html-compile will combine all files with the same "build" attribute, and replace the html script reference.

Setting build to "inline" will place the script directly in the page.

**html-compile will only look for links in the head section**

**Input:**
```
<head>
    <script build="main.js" src="./index.js" async defer></script>
    <script build="main.js" src="./helpers/query.js"></script>
    <script build="auth.js" src="./helpers/login.js"></script>
    <script build="inline" src="./hello_world.js"></script>
    <link rel="stylesheet" build="main.css" href="./css/grids.css">
    <link rel="stylesheet" build="main.css" href="./css/fonts.css">
</head>
```


**Output:**
```
<head>
    <script src="./main.js" async defer></script>
    <script src="./auth.js"></script>
    <script>
        console.log("hello world")
    </script>
    <link rel="stylesheet" href="./main.css">
</head>
```

In the example above, html-compile will combine index.js and query.js into a single file "main.js".  login.js will be placed in a seperate file called "auth.js". 

### Running the Tool

```
htmc -i pathToFile -o pathToOutputFolder [-overwrite] [-inline]
```


| Flag | Required | Description |
| ---- | -------- | ----------- |
| -i   |   Yes     | Path to input html file |
| -o | No | Output path. Must be a directory. Omit to overwrite the existing file |
| -overwrite | No | Include this flag to overwrite the existing file instead of writing to a new directory. If this option is specified, htm-compile will also delete any compiled files. |
| -inline | No | Ignore the "build" attributes in the html and put all source files inline |



# Installation

```
npm install -g html-compile
```

// Note: the code will still work without this line, but without it you
// will see an error in the editor
/* global EspLoader, ESP_ROM_BAUD, port, reader, inputBuffer */
'use strict';

let espTool;
let isConnected = false;

const baudRates = [115200];

const bufferSize = 512;
const colors = ['#00a7e9', '#f89521', '#be1e2d'];
const measurementPeriodId = '0001';

const eraseFillByte = 0xee;

const maxLogLength = 100;
const log = document.getElementById('log');
const butConnect = document.getElementById('butConnect');
const baudRate = document.getElementById('baudRate');
const butClear = document.getElementById('butClear');
const butProgram = document.getElementById('butProgram');
const autoscroll = document.getElementById('autoscroll');
const lightSS = document.getElementById('light');
const darkSS = document.getElementById('dark');
const darkMode = document.getElementById('darkmode');
const firmware = document.querySelectorAll(".upload .firmware input");
const progress = document.querySelectorAll(".upload .progress-bar");
const offsets = document.querySelectorAll('.upload .offset');
const appDiv = document.getElementById('app');

let base_offset = 0;
let colorIndex = 0;
let activePanels = [];
let bytesReceived = 0;
let currentBoard;
let buttonState = 0;
let debugState = false;

document.addEventListener('DOMContentLoaded', () => {
  let debug = false;
  var getParams = {}
  location.search.substr(1).split("&").forEach(function(item) {getParams[item.split("=")[0]] = item.split("=")[1]})
  if (getParams["debug"] !== undefined) {
    debug = getParams["debug"] == "1" || getParams["debug"].toLowerCase() == "true";
    debugState = debug;
  }

  espTool = new EspLoader({
    updateProgress: updateProgress,
    logMsg: logMsg,
    debugMsg: debugMsg,
    debug: debug})
  butConnect.addEventListener('click', () => {
    clickConnect().catch(async (e) => {
      errorMsg(e.message);
      disconnect();
      toggleUIConnected(false);
    });
  });
  butClear.addEventListener('click', clickClear);
  butProgram.addEventListener('click', clickProgram);
  for (let i = 0; i < firmware.length; i++) {
    firmware[i].addEventListener('change', checkFirmware);
  }
  for (let i = 0; i < offsets.length; i++) {
    offsets[i].addEventListener('change', checkProgrammable);
  }
  autoscroll.addEventListener('click', clickAutoscroll);
  baudRate.addEventListener('change', changeBaudRate);
  darkMode.addEventListener('click', clickDarkMode);
  window.addEventListener('error', function(event) {
    console.log("Got an uncaught error: ", event.error)
  });
  if ('serial' in navigator) {
    const notSupported = document.getElementById('notSupported');
    notSupported.classList.add('hidden');
  }

  initBaudRate();
  loadAllSettings();
  updateTheme();
  logMsg("WebSerial ESPTool loaded.");
  downloadFirmware();
});


async function downloadFirmware() {

}

/**
 * @name connect
 * Opens a Web Serial connection to a micro:bit and sets up the input and
 * output stream.
 */
async function connect() {
  logMsg("Connecting...")
  await espTool.connect()
  readLoop().catch((error) => {
    toggleUIConnected(false);
  });
}

function initBaudRate() {
  for (let rate of baudRates) {
    var option = document.createElement("option");
    option.text = rate + " Baud";
    option.value = rate;
    baudRate.add(option);
  }
}

function updateProgress(part, percentage) {
  let progressBar = progress[part].querySelector("div");
  progressBar.style.width = percentage + "%";
}

/**
 * @name disconnect
 * Closes the Web Serial connection.
 */
async function disconnect() {
  toggleUIToolbar(false);
  await espTool.disconnect()
}

/**
 * @name readLoop
 * Reads data from the input stream and places it in the inputBuffer
 */
async function readLoop() {
  reader = port.readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      reader.releaseLock();
      break;
    }
    inputBuffer = inputBuffer.concat(Array.from(value));
  }
}

function logMsg(text) {
  log.innerHTML += text+ "<br>";

  // Remove old log content
  if (log.textContent.split("\n").length > maxLogLength + 1) {
    let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
    log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
  }

  if (autoscroll.checked) {
    log.scrollTop = log.scrollHeight
  }
}

function debugMsg(...args) {
  function getStackTrace() {
    let stack = new Error().stack;
    stack = stack.split("\n").map(v => v.trim());
    for (let i=0; i<3; i++) {
        stack.shift();
    }

    let trace = [];
    for (let line of stack) {
      line = line.replace("at ", "");
      trace.push({
        "func": line.substr(0, line.indexOf("(") - 1),
        "pos": line.substring(line.indexOf(".js:") + 4, line.lastIndexOf(":"))
      });
    }

    return trace;
  }

  let stack = getStackTrace();
  stack.shift();
  let top = stack.shift();
  let prefix = '<span class="debug-function">[' + top.func + ":" + top.pos + ']</span> ';
  for (let arg of args) {
    if (typeof arg == "string") {
      logMsg(prefix + arg);
    } else if (typeof arg == "number") {
      logMsg(prefix + arg);
    } else if (typeof arg == "boolean") {
      logMsg(prefix + arg ? "true" : "false");
    } else if (Array.isArray(arg)) {
      logMsg(prefix + "[" + arg.map(value => espTool.toHex(value)).join(", ") + "]");
    } else if (typeof arg == "object" && (arg instanceof Uint8Array)) {
      logMsg(prefix + "[" + Array.from(arg).map(value => espTool.toHex(value)).join(", ") + "]");
    } else {
      logMsg(prefix + "Unhandled type of argument:" + typeof arg);
      console.log(arg);
    }
    prefix = "";  // Only show for first argument
  }
}

function errorMsg(text) {
  logMsg('<span class="error-message">Error:</span> ' + text);
  console.log(text);
}

function formatMacAddr(macAddr) {
  return macAddr.map(value => value.toString(16).toUpperCase().padStart(2, "0")).join(":");
}

/**
 * @name updateTheme
 * Sets the theme to  Adafruit (dark) mode. Can be refactored later for more themes
 */
function updateTheme() {
  // Disable all themes
  document
    .querySelectorAll('link[rel=stylesheet].alternate')
    .forEach((styleSheet) => {
      enableStyleSheet(styleSheet, false);
    });

  if (darkMode.checked) {
    enableStyleSheet(darkSS, true);
  } else {
    enableStyleSheet(darkSS, false);
  }
}

function enableStyleSheet(node, enabled) {
  node.disabled = !enabled;
}

/**
 * @name reset
 * Reset the Panels, Log, and associated data
 */
async function reset() {
  bytesReceived = 0;

  // Clear the log
  log.innerHTML = "";
}

/**
 * @name clickConnect
 * Click handler for the connect/disconnect button.
 */
async function clickConnect() {
  if (espTool.connected()) {
    await disconnect();
    toggleUIConnected(false);
    return;
  }

  await connect();

  toggleUIConnected(true);
  try {
    if (await espTool.sync()) {
      toggleUIToolbar(true);
      appDiv.classList.add("connected");
      let baud = parseInt(baudRate.value);
      logMsg("Connected to " + await espTool.chipName());
      logMsg("MAC Address: " + formatMacAddr(espTool.macAddr()));
      var flashWriteSize = await espTool.getFlashID();
      logMsg("Flash Size: " + (flashWriteSize/1024) + " MB ");
      espTool.setBaudrate(115200);
      espTool = await espTool.runStub();
      
      if (baud != ESP_ROM_BAUD) {
        if (await espTool.chipType() == ESP32) {
          logMsg("WARNING: ESP32 is having issues working at speeds faster than 115200. Continuing at 115200 for now...")
        } else {
          await changeBaudRate(baud);
        }
      }
    }
  } catch(e) {
    errorMsg(e);
    await disconnect();
    toggleUIConnected(false);
    return;
  }
}
/**
 * @name changeBaudRate
 * Change handler for the Baud Rate selector.
 */
async function changeBaudRate() {
  saveSetting('baudrate', baudRate.value);
  if (isConnected) {
    let baud = parseInt(baudRate.value);
    if (baudRates.includes(baud)) {
      await espTool.setBaudrate(baud);
    }
  }
}

/**
 * @name clickAutoscroll
 * Change handler for the Autoscroll checkbox.
 */
async function clickAutoscroll() {
  saveSetting('autoscroll', autoscroll.checked);
}

/**
 * @name clickDarkMode
 * Change handler for the Dark Mode checkbox.
 */
async function clickDarkMode() {
  updateTheme();
  saveSetting('darkmode', darkMode.checked);
}

async function getFirmwareFiles(branch,erase=false,bytes=0x00) {
	let url_memmap = "https://raw.githubusercontent.com/O-MG/WebFlasher/main/assets/memmap.json";
    let url_base = "https://raw.githubusercontent.com/O-MG/O.MG_Cable-Firmware";
    
    const readUploadedFileAsArrayBuffer = (inputFile) => {
        const reader = new FileReader();

        return new Promise((resolve, reject) => {
            reader.onerror = () => {
                reader.abort();
                reject(new DOMException("Problem parsing input file."));
            };

            reader.onload = () => {
                resolve(reader.result);
            };
            reader.readAsArrayBuffer(inputFile);
        });
    };
    const getResourceMap = (url) => {
		return fetch(url, {
		  method: 'GET',
		})
		.then(function(response) {
		  return response.json();
		})
		.then(function(data) {   
		  return data;
		})
	};
	
    let url = url_base + "/" + branch + "/firmware/";
    let files_raw = await getResourceMap(url_memmap);
    let flash_list = []
    let chip_flash_size = await espTool.getFlashID();
    let chip_files = files_raw['2048'];
    if(chip_flash_size in files_raw){
    	if(debugState){
	    	console.log("flash size: " + chip_flash_size);
	    }
    	chip_files = files_raw[chip_flash_size];
    } else {
    	logMsg("Error, invalid flash size found " + chip_flash_size);
    }
    for (let i = 0; i < chip_files.length; i++) {
    	if(!("name" in chip_files[i]) || !("offset" in chip_files[i])){
    		logMsg("Invalid data, cannot load online flash resources");
    	}
    	let request_file = url + chip_files[i]['name'];
    	if(debugState){
    	    	console.log(request_file);
    	}
        let tmp = await fetch(request_file).then((response) => {
            if (response.status >= 400 && response.status < 600) {
                logMsg("Error! Failed to fetch '" + request_file + "' due to error response " + response.status)
                throw new Error("Bad response from server");
            }
            logMsg("Loaded online version of " + request_file + ". ");
            return response.blob();
        }).then((myblob) => myblob).catch((error) => {
            console.log(error)
        });
        if (tmp === undefined) {
            // missing file
            logMsg("Invalid file downloaded " + chip_files['name']);
        } else {
        	let contents = await readUploadedFileAsArrayBuffer(tmp);
        	let content_length = contents.byteLength;
        	// if we want to "erase", we set this to be true
        	if(erase){
        		contents = ((new Uint8Array(content_length)).fill(bytes)).buffer;
        	}
        	flash_list.push({
        		'name': chip_files[i]['name'],
        		'offset': chip_files[i]['offset'],
        		'data': contents
        	});
        	if(debugState){
	        	console.log("data queried for flash");
	        	console.log(flash_list);
	        }
        }
    }
    return flash_list;
}

async function clickProgram() {
  baudRate.disabled = true;
  butProgram.disabled = false;
 
  // and move on
  let branch = String(document.querySelector('#branch').value);
  let bins = await getFirmwareFiles(branch);
  console.log(bins);
  logMsg("Flashing firmware based on code branch " + branch + ". ");
  for (let bin of bins) {
    try {
      let offset = parseInt(bin['offset'], 16);
      let contents = bin['data'];
      let name = bin['name'];
      await espTool.flashData(contents, offset, name);
      await sleep(1000);
    } catch(e) {
      errorMsg(e);
    }
  }
  logMsg("To run the new firmware, please unplug your device and plug into normal USB port.");
  baudRate.disabled = false;
}

async function clickErase() {
  baudRate.disabled = true;
  butProgram.disabled = false;
 
  // and move on
  let branch = String(document.querySelector('#branch').value);
  let bins = await getFirmwareFiles(branch,true,eraseFillByte);
  console.log(bins);
  logMsg("Erasing based on block sizes based on code branch " + branch + " with " + eraseFillByte);
  for (let bin of bins) {
    try {
      let offset = parseInt(bin['offset'], 16);
      let contents = bin['data'];
      let name = bin['name'];
      await espTool.flashData(contents, offset, name);
      await sleep(100);
    } catch(e) {
      errorMsg(e);
    }
  }
  logMsg("Erasing complete, please continue with flash process after cycling");
}



/**
 * @name checkFirmware
 * Handler for firmware upload changes
 */
async function checkFirmware(event) {
  let filename = event.target.value.split("\\" ).pop();
  let label = event.target.parentNode.querySelector("span");
  let icon = event.target.parentNode.querySelector("svg");
  if (filename != "") {
    if (filename.length > 17) {
      label.innerHTML = filename.substring(0, 14) + "&hellip;";
    } else {
      label.innerHTML = filename;
    }
    icon.classList.add("hidden");
  } else {
    label.innerHTML = "Choose a file&hellip;";
    icon.classList.remove("hidden");
  }

  //await checkProgrammable();
}

/**
 * @name clickClear
 * Click handler for the clear button.
 */
async function clickClear() {
  reset();
}

function convertJSON(chunk) {
  try {
    let jsonObj = JSON.parse(chunk);
    return jsonObj;
  } catch (e) {
    return chunk;
  }
}

function toggleUIToolbar(show) {
  isConnected = show;
  for (let i=0; i< 4; i++) {
    progress[i].classList.add("hidden");
    progress[i].querySelector("div").style.width = "0";
  }
  if (show) {
    appDiv.classList.add("connected");
  } else {
    appDiv.classList.remove("connected");
  }
}

function toggleUIConnected(connected) {
  let lbl = 'Connect';
  if (connected) {
    lbl = 'Disconnect';
  } else {
    toggleUIToolbar(false);
  }
  butConnect.textContent = lbl;
}

function loadAllSettings() {
  // Load all saved settings or defaults
  autoscroll.checked = loadSetting('autoscroll', true);
  baudRate.value = loadSetting('baudrate', baudRates[0]);
  darkMode.checked = loadSetting('darkmode', true);
}

function loadSetting(setting, defaultValue) {
  let value = JSON.parse(window.localStorage.getItem(setting));
  if (value == null) {
    return defaultValue;
  }

  return value;
}

function saveSetting(setting, value) {
  window.localStorage.setItem(setting, JSON.stringify(value));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
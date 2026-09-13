// Minimal CSInterface shim.
// CEP injects `window.__adobe_cep__` into every extension panel; this wraps
// the handful of calls this extension actually needs (evalScript + host env).
function CSInterface() {}

CSInterface.prototype.getSystemPath = function (pathType) {
    return window.__adobe_cep__.getSystemPath(pathType);
};

CSInterface.prototype.evalScript = function (script, callback) {
    if (!callback) callback = function () {};
    window.__adobe_cep__.evalScript(script, callback);
};

CSInterface.prototype.addEventListener = function (type, listener, obj) {
    window.__adobe_cep__.addEventListener(type, listener, obj);
};

CSInterface.prototype.getHostEnvironment = function () {
    return JSON.parse(window.__adobe_cep__.getHostEnvironment());
};

CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    window.__adobe_cep__.requestOpenExtension(extensionId, params);
};

CSInterface.prototype.closeExtension = function () {
    window.__adobe_cep__.closeExtension();
};

var SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication"
};

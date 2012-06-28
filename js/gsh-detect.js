//if ($('link[rel="http://purl.org/xventory/sink"]').length > 1) {
var $link = $('link[rel="http://purl.org/xventory/sink"]');
if ($link.length > 0) {
    chrome.extension.sendRequest({}, function(response) {});
}

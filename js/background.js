// currently not used.....
// activate page action
chrome.extension.onRequest.addListener(
    function(request, sender, sendResponse) {
        // show the page action
        chrome.pageAction.show(sender.tab.id);
        // send nothing back to clean up the connection
        sendResponse({});
    }
);
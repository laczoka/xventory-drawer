chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
        drawer.store.addItem(drawer.store.DB,request,function(success, results) {
            if (success)
                sendResponse({success:true});
            else
                sendResponse({error:results});
        });

});
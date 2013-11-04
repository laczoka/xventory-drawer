chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.GETITEMS) {
            console.log("!REceived");
            //sendResponse("OK");
            sendResponse(drawer.getItems());
        }
        //else {
        //drawer.store.addItem(drawer.store.DB,request,function(success, results) {
        //    if (success)
        //        sendResponse({success:true});
        //    else
        //        sendResponse({error:results});
        //}); }
});
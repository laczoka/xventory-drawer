// UI
function PinventoryViewModel(db) {
    var self = this;
    self.pitems = ko.observableArray([]);

    self.noPItemsYet = ko.computed(function () {
        return self.pitems().length < 1;
    });

    // react to changes in the datastore
    self.itemAdded = function(newItem) {
        self.pitems.push(newItem);
        self.showNotification("success", "Just added a "+newItem.name+" to your inventory.")
    };

    // process command from the UI
    self.addNewItem = function (itemdata) {
        drawer.store.addItem(db, drawer.Item.createFromFreebaseHint(itemdata), self.itemAdded);
    };

    self.candidateItem = ko.observable(null);

    self.setCandidateItem = function (itemdata) {
        var item = drawer.Item.createFromFreebaseHint(itemdata);
        self.candidateItem(item);
    };
    self.addCandidateItem = function() {
        var newItem = self.candidateItem();
        if (newItem !== null) {
            self.addNewItem(newItem);
        }
        self.candidateItem(null);
    };
    self.deleteAllItems = function() {
        if (confirm("This operation will remove all items from your personal inventory and CAN'T be undone!")) {
            drawer.store.clear(drawer.store.DB, function(result)
            {
                if (result == success) {
                    self.pitems.removeAll();
                }
            });
        }
    };

    // Notification support
    self.notification = ko.observable(null);
    self.notificationsEnabled = true;

    self.showNotification = function(type,msg) {
        if (self.notificationsEnabled) {
            self.notification({type:type, msg:msg});
            setTimeout(function() {
                self.notification(null);
            }, 2000);
        }
    };

    // init
    // with notifications disabled
    self.notificationsEnabled = false;
    drawer.store.getItems(db, function(success, items) {
        if (success) {
            $.each(items, function(idx, val) {
                self.itemAdded({ name: val.name.value, imageUrl: val.imageUrl.value });
            });
        }
    });
    // turned back on
    self.notificationsEnabled = true;
}

// setup loop
$(function () {
    var VM = new PinventoryViewModel(drawer.store.DB);

    ko.applyBindings(VM);

    $("#new_gadget_name")
        .suggest({"key":"AIzaSyCi0UfQrWCpa2hfslt7w-e6GhABQO_Pvoc"})
        .bind("fb-select", function (e, data) {
            VM.setCandidateItem(data);
        });
    $("body").on({
        "click":function() {
            VM.addCandidateItem();
        }
    }, "#add_new_gadget_action");
    $("#reset_store").on("click",function() {
        VM.deleteAllItems();
    });
    $("#jump_to_add_new").on("click", function(e) {
        e.preventDefault();
        $('#navibar a[href="#add_new_item_tab"]').tab('show');
    });

});

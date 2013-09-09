function Drawer() {
    var self = this;
    self._db = window.localStorage;

    self.items = ko.observableArray(self._db["Pinventory"] ? JSON.parse(self._db["Pinventory"]) : []);

    self.save = function() {
        self._db["Pinventory"] = JSON.stringify(self.items());
    };

    self.addItem = function(newItem) {
       var productID = _.intersection(['gtin8', 'gtin13', 'gtin14', 'asin'], _.keys(newItem)).pop();

       var product_found_in_inventory = productID && _.find(self.items(),
           function(i) {
            return i[productID] && (i[productID] == newItem[productID]); });

       if (!product_found_in_inventory) {
           self.items.push(newItem);
       }
       return !product_found_in_inventory;
    };

    self.addItems = function(newItemsArr) {
        return _.map(newItemsArr,self.addItem);
    };

    self.deleteAll = function() {
        self._db["Pinventory"] = JSON.stringify([]);
        self.items.removeAll();
    };
}

drawer = new Drawer();

function PinventoryViewModel(drawer) {
    var self = this;
    self.pitems = drawer.items;

    // UI
    self.noPItemsYet = ko.computed(function () {
        return self.pitems().length < 1;
    });

    // react to changes in the datastore
    self.itemAdded = function(newItem) {
        self.pitems.push(newItem);
        self.showNotification("success", "Just added a "+newItem.name+" to your inventory.")
    };

    self.candidateItem = ko.observable(null);

    self.deleteAllItems = function() {
        drawer.deleteAll();
    };

    self.sortItemsMostRecentFirst = function() {
        self.pitems.sort(function(left,right) {
           var ld = left.ownedFrom ? left.ownedFrom : 0;
           var rd = right.ownedFrom ? right.ownedFrom : 0;
           return ld == rd ? 0 : (ld < rd ? 1 : -1);
        });
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

    self.formatDate = function(dt) {
        var d = new Date(dt);
        return d ? d.toDateString() : "N/A";
    };

    // init
    // with notifications disabled
    self.notificationsEnabled = false;
    // turned back on
    self.notificationsEnabled = true;
}

// setup loop
$(function () {
    var VM = new PinventoryViewModel(drawer);

    ko.applyBindings(VM, document.getElementById("inventoryTab"));

    $("#emptyInventoryBtn").on("click",function() {
        VM.deleteAllItems();
    });

    $("#sortByDateDesc").on("click", function() {
       VM.sortItemsMostRecentFirst();
    });

    $("#closeWindow").on("click", function() { window.close();});

});

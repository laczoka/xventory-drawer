function Drawer($) {
    var self = this;
    self.$body = $("body");
    self._db = window.localStorage;
    self.items = undefined;

    self.reload = function() {
        self.items = self._db["Pinventory"] ? JSON.parse(self._db["Pinventory"]) : [];
        self.$body.trigger("drawer.itemsLoaded");
    }

    self.reload();

    self.save = function() {
        self._db["Pinventory"] = JSON.stringify(self.items);
    };

    self.addItem = function(newItem) {
       var pIDkey = _.intersection(['gtin8', 'gtin13', 'gtin14', 'asin'], _.keys(newItem)).pop();
       var pID = pIDkey && newItem[pIDkey];
       var product_found_in_inventory = pID && _.find(self.items,
           function(i) {
               var found = i[pIDkey] && (i[pIDkey] == pID)
                && i["ownedFrom"] && (i["ownedFrom"] == newItem["ownedFrom"]);

            return found;});

       if (!product_found_in_inventory) {
           self.items.push(newItem);
           self.$body.trigger("drawer.itemAdded", newItem);
       }
       return !product_found_in_inventory;
    };

    self.addItems = function(newItemsArr) {
        return _.map(newItemsArr,self.addItem);
    };

    self.deleteAll = function() {
        self._db["Pinventory"] = JSON.stringify([]);
        self.reload();
    };
}

drawer = new Drawer($);

function PinventoryViewModel(drawer) {
    var self = this;
    var $body = $("body");
    self.pitems = ko.observableArray(drawer.items.slice());

    // UI
    self.noPItemsYet = ko.computed(function () {
        return self.pitems().length < 1;
    });

    // react to changes in the datastore
   /* self.itemAdded = function(newItem) {
        self.pitems.push(newItem);
        self.showNotification("success", "Just added a "+newItem.name+" to your inventory.")
    }; */

    self.candidateItem = ko.observable(null);

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

    $body.on("drawer.itemAdded", function(event, newItem) {
        self.pitems.push(newItem);
    });
    $body.on("drawer.itemsLoaded", function(event) {
        self.pitems(drawer.items);
    })
}

// setup
(function() {
var VM = new PinventoryViewModel(drawer);

$("#emptyInventoryBtn").on("click",function() {
    drawer.deleteAll();
});

$("#sortByDateDesc").on("click", function() {
    VM.sortItemsMostRecentFirst();
});

$("#closeWindow").on("click", function() { window.close();});

$(function () {
    ko.applyBindings(VM, document.getElementById("inventoryTab"));
});
})();

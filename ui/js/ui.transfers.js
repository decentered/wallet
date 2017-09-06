var UI = (function(UI, $, undefined) {
  var modal, doubleSpend, $stack;

  UI.handleTransfers = function() {
    $stack = $("#transfer-stack");

    $("#transfer-btn").on("click", function(e) {    
      console.log("UI.handleTransfers: Click");

      if ($("#transfer-autofill").val() == "1") {
        UI.formError("transfer", "are_you_sure", {"initial": "yes_send_now"});
        $("#transfer-autofill").val("0");
        return;
      }

      $stack.addClass("loading");

      var address, amount, tag;

      try {
        address = $.trim($("#transfer-address").val());

        if (!address) {
          throw UI.t("address_is_required");
        } else if (address.length == 81) {
          throw UI.t("missing_address_checksum");
        } else if (address.length != 90) {
          throw UI.t("incorrect_address_length");
        } else if (!address.match(/^[A-Z9]+$/)) {
          throw UI.t("invalid_address");
        } else if (!iota.utils.isValidChecksum(address)) {
          throw UI.t("incorrect_address_checksum");
        }

        var rawAmount = $.trim($("#transfer-amount").val());
        var rawUnits  = $("#transfer-units-value").html();

        if (!rawAmount) {
          throw UI.t("amount_cannot_be_zero");
        } else {
          amount = iota.utils.convertUnits(parseFloat(rawAmount), rawUnits, "i");

          if (!amount) {
            throw UI.t("amount_cannot_be_zero");
          }
        }

        if ($("#transfer-tag-container").is(":visible")) {
          tag = $.trim($("#transfer-tag").val().toUpperCase());

          if (tag && (/[^A-Z9]/.test(tag) || tag.length > 27)) {
            throw UI.t("tag_is_invalid");
          }
        }
      } catch (error) {
        $stack.removeClass("loading");
        UI.formError("transfer", error);
        return;
      }

      console.log("Server.transfer: " + address + " -> " + amount);

      UI.isDoingPOW = true;

      getUnspentInputs(connection.seed, 0, amount, function(error, inputs) {
        if (error) {
          UI.isDoingPOW = false;
          UI.formError("transfer", error, {"initial": "send_it_now"});
          $stack.removeClass("loading");
          return;
        } else if (inputs.inputs.length == 0) {
          UI.isDoingPOW = false;
          UI.formError("transfer", "key_reuse_error", {"initial": "send_it_now"});
          modal = $("#key-reuse-warning-modal").remodal({hashTracking: false, closeOnOutsideClick: false, closeOnEscape: false});
          modal.open();
          return;
        } else if (inputs.totalBalance < amount) {
          UI.isDoingPOW = false;
          UI.formError("transfer", "not_enough_balance", {"initial": "send_it_now"});
          $stack.removeClass("loading");
          return;
        }

        iota.api.sendTransfer(connection.seed, connection.depth, connection.minWeightMagnitude, [{"address": address, "value": amount, "message": "", "tag": tag}], {"inputs": inputs.inputs}, function(error, transfers) {
          UI.isDoingPOW = false;
          if (error) {
            console.log(error);
            UI.formError("transfer", error, {"initial": "send_it_now"});
          } else {
            console.log("UI.handleTransfers: Success");
            UI.formSuccess("transfer", "transfer_completed", {"initial": "send_it_now"});
            UI.updateState(1000);
          }
          $stack.removeClass("loading");
        });
      });
    });

    $("#key-reuse-close-btn").on("click", function(e) {
      modal.close();
      $("#key-reuse-close-btn").loadingReset("close");
    });

    $("#transfer-units-value").on("click", function(e) {
      var $overlay = $("#overlay");
      var $select = $('<div class="dropdown" id="transfer-units-select">' + 
                        '<ul>' + 
                          '<li class="iota-i">i</li>' + 
                          '<li class="iota-ki">Ki</li>' + 
                          '<li class="iota-mi">Mi</li>' + 
                          '<li class="iota-gi">Gi</li>' + 
                          '<li class="iota-ti">Ti</li>' + 
                        '</ul>' + 
                      '</div>');

      $overlay.show();

      $("#transfer-units-select").remove();

      $("body").append($select);

      var offset = $(this).offset();

      $select.css({"position": "absolute", "top": (offset.top + $(this).innerHeight() + 15) + "px", "left": (offset.left) + "px", "width": $(this).outerWidth() + "px"}).addClass("active");

      $select.on("click", "li", function(e) {
        $select.removeClass("active");
        $("#transfer-units-value").html($(this).html());
        $overlay.hide().off("click.transfer");
        $(window).off("resize.transfer");
      });

      $overlay.on("click.transfer", function(e) {
        $select.removeClass("active");
        $(this).hide().off("click.transfer");
        $(window).off("resize.transfer");
      });

      $(window).on("resize.transfer", function() {
        var $rel = $("#transfer-units-value")
        var offset = $rel.offset();
        $select.css({"position": "absolute", "top": (offset.top + $rel.innerHeight() + 15) + "px", "left": (offset.left) + "px", "width": $rel.outerWidth() + "px"});
      });
    });

    $("#transfer-units-select").on("click", function(e) {
      e.preventDefault();
      e.stopPropagation();

      var $ul = $(this).find("ul");
      $ul.addClass("active");
      $ul.find("li").click(function(e) {
        e.preventDefault();
        e.stopPropagation();

        $ul.find("li").unbind();
        $ul.find("li").removeClass("selected");
        $(this).addClass("selected");
        $ul.removeClass("active");
        $("body").unbind("click.dropdown");
      });

      $("body").on("click.dropdown", function(e) {
        $ul.removeClass("active");
        $("body").unbind("click.dropdown");
      }); 
    });
  }

  UI.onOpenTransferStack = function() {
    if ($("#transfer-address").val() == "") {
      $("#transfer-address").focus();
    }
  }

  return UI;
}(UI || {}, jQuery));


function filterSpentInputs(inputs) {
  return new Promise((resolve, reject) => {
    iota.api.findTransactionObjects({addresses: inputs.map(input => input.address)}, (err, txs) => {
      if (err) {
        reject(err)
      }
      txs = txs.filter(tx => tx.value < 0)
      var bundleHashes = txs.map(tx => tx.bundle)
      if (txs.length > 0) {
        var bundles = txs.map(tx => tx.bundle)
        iota.api.findTransactionObjects({bundles: bundles}, (err, txs) => {
          if (err) {
            reject(err)
		      }
          var hashes = txs.filter(tx => tx.currentIndex === 0)
          var allBundleHashes = txs.map(tx => tx.bundle)
          hashes = hashes.map(tx => tx.hash)
		      iota.api.getLatestInclusion(hashes, (err, states) => {
            if (err) {
              reject(err)
            }
            var confirmedHashes = hashes.filter((hash, i) => states[i])
            var unconfirmedHashes = hashes.filter(hash => confirmedHashes.indexOf(hash) === -1).map(hash => {
              return { hash: hash, validate: true }
            })
            var getBundles = confirmedHashes.concat(unconfirmedHashes).map(hash => new Promise((resolve, reject) => {
                iota.api.traverseBundle(typeof hash == 'string' ? hash : hash.hash, null, [], (err, bundle) => {
                if (err) {
                  reject(err)
                }
                resolve(typeof hash === 'string' ? bundle : {bundle: bundle, validate: true})
              })
            }))
            resolve(Promise.all(getBundles).then(bundles => {
              bundles = bundles.filter(bundle => {
                if (bundle.validate) {
                  return iota.utils.isBundle(bundle.bundle)
                }
                return true
              }).map(bundle => bundle.hasOwnProperty('validate') ? bundle.bundle : bundle)
              var blacklist = bundles.reduce((a, b) => a.concat(b), []).filter(tx => tx.value < 0).map(tx => tx.address)
              return inputs.filter(input => blacklist.indexOf(input.address) === -1)
            }).catch(err => reject(err)))
		      })
 	      })
      }
      else {
        resolve(inputs);
      }
    })
  })
}

function getUnspentInputs(seed, start, threshold, inputs, cb) {
  if (arguments.length === 4) {
    cb = arguments[3]
    inputs = {inputs: [], totalBalance: 0}
  }
  iota.api.getInputs(seed, {start: start, threshold: threshold}, (err, res) => {
    if (err) {
      cb(err)
      return
    }
    filterSpentInputs(res.inputs).then(filtered => {
      var collected = filtered.reduce((sum, input) => sum + input.balance, 0)
      var diff = threshold - collected
      if (diff > 0) {
        var ordered = res.inputs.sort((a, b) => a.keyIndex - b.keyIndex).reverse()
        var end = ordered[0].keyIndex
        getUnspentInputs(seed, end + 1, diff, {inputs: inputs.inputs.concat(filtered), totalBalance: inputs.totalBalance + collected}, cb)
      }
      else {
        cb(null, {inputs: inputs.inputs.concat(filtered), totalBalance: inputs.totalBalance + collected})
      }
    }).catch(err => cb(err))
  })
}


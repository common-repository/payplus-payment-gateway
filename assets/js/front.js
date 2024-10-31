window.addEventListener("load", function () {
  let body = window.getComputedStyle(document.body, null);
  let titleExpressCheckout = document.querySelector(
    ".title-express-checkout span"
  );
  if (titleExpressCheckout) {
    titleExpressCheckout.style.background = body.background;
  }
});

const googleButton = document.getElementById("googlePayButton");
const appleButton1 = document.getElementById("applePayButton");
let productID = googleButton
  ? googleButton.getAttribute("data-product-id")
  : appleButton1
  ? appleButton1.getAttribute("data-product-id")
  : false;
//APPLE PAY
let currentShippingPrice = 0;
let currentShippingTax = 0;
let currentShippingIdentifier;
let currentShippingArrayPayPlus;
let globalPriceProductsWithoutTax = 0;
let globalPriceProductsWithTax = 0;
let globalTaxForProducts = 0;
let globalDiscount = 0;
let appleTotalPrice = 0;
let globalPayingVat = true;
let ArrayCheckoutItemsApplePay = [];
let isProductPage = !!productID;
const payment_url_google_pay_iframe =
  payplus_script.payment_url_google_pay_iframe;
let textError = "error : ";

const applePayScript = document.createElement("script");
applePayScript.setAttribute(
  "src",
  "https://applepay.cdn-apple.com/jsapi/v1/apple-pay-sdk.js"
);
applePayScript.setAttribute("async", true);
applePayScript.setAttribute("defer", true);
applePayScript.onload = () => ApplePayPayLoaded();
document.head.appendChild(applePayScript);
let applePayConfig;

function ApplePayPayLoaded() {
  if (window.ApplePaySession) {
    const appleButton = document.getElementById("applePayButton");
    appleButton.style.display = "block";
    const style = document.createElement("style");
    document.head.appendChild(style);
    style.sheet.insertRule(`
              @supports (-webkit-appearance: -apple-pay-button) {
                .apple-pay-button-with-text {
                  display: inline-block;
                  -webkit-appearance: -apple-pay-button;
                  -apple-pay-button-type: buy;
                }
                .apple-pay-button-with-text > * {
                  display: none;
                }
                .apple-pay-button-black-with-text {
                  -apple-pay-button-style: black;
                }
                .apple-pay-button-white-with-text {
                  -apple-pay-button-style: white;
                }
                .apple-pay-button-white-with-line-with-text {
                  -apple-pay-button-style: white-outline;
                }
              }
            `);
  } else {
    const applePay = document.getElementById("applePayButton");
    if (applePay) {
      applePay.style.display = "none";
    }
    console.log("No ApplePay");
  }
}

function setApplePayConfig() {
  // Set Apple Pay configuration
  applePayConfig = {
    countryCode: "IL",
    currencyCode: document.getElementById("payplus_currency_code").value,
    displayName: "Items",
    supportedNetworks: ["visa", "masterCard", "amex"],
    merchantCapabilities: ["supports3DS"],
    requiredShippingContactFields: ["postalAddress", "phone", "email"],
    total: { label: "Total", amount: 1, type: "final" },
    lineItems: [],
    shippingMethods: [],
  };
}

async function onValidateMerchant(event, session) {
  try {
    let data;
    const additionalData = {
      urlValidation: event.validationURL,
    };
    await jQuery.ajax({
      type: "post",
      dataType: "json",
      url: payplus_script.ajax_url,
      data: {
        action: "apple-onvalidate-merchant",
        obj: additionalData,
        _ajax_nonce: payplus_script.frontNonce,
      },
      success: function (response) {
        data = response;
      },
      error: function (jqXHR, textStatus, errorThrow) {
        displayMsgError(textError + textStatus + "-" + errorThrow);
        //show error
      },
    });
    return data;
  } catch (e) {
    displayMsgError(textError + e.message);
  }
}

function updatePayingVat(contact) {
  return new Promise((resolve, reject) => {
    jQuery.ajax({
      type: "post",
      dataType: "json",
      url: payplus_script.ajax_url,
      data: {
        action: "check-customer-vat-oc",
        obj: contact,
        _ajax_nonce: payplus_script.frontNonce,
      },
      success: function (response) {
        paying_vat = response.paying_vat;
        globalPayingVat = paying_vat;
        resolve();
      },
      error: function (jqXHR, textStatus, errorThrow) {
        displayMsgError(textError + textStatus + "-" + errorThrow);
        //show error
        reject(jqXHR);
      },
    });
  });
}

function updateApplePayConfig(
  formattedtShippingArray,
  formattedtShippingArrayPayPlus
) {
  applePayConfig.shippingMethods = formattedtShippingArray;
  currentShippingPrice = formattedtShippingArray.length
    ? formattedtShippingArray[0]?.amount
    : 0;
  currentShippingTax = formattedtShippingArrayPayPlus.length
    ? formattedtShippingArrayPayPlus[0]?.tax_amount
    : 0;
  currentShippingIdentifier = formattedtShippingArray.length
    ? formattedtShippingArray[0]?.identifier
    : "";
}

function updateLineItems() {
  let newLineItems = [];
  newLineItems.push(...ArrayCheckoutItemsApplePay);
  if (globalDiscount) {
    newLineItems.push({
      label: "Discount",
      type: "final",
      amount: -globalDiscount,
    });
  }
  newLineItems.push({
    label: "Shipping",
    type: "final",
    amount: currentShippingPrice,
  });
  newLineItems.push({
    label: "Estimated Tax",
    type: "final",
    amount: globalPayingVat ? globalTaxForProducts + currentShippingTax : 0,
  });
  return newLineItems;
}

function calculateTotal() {
  const newTotal = calculateNewTotal(
    globalPriceProductsWithoutTax - globalDiscount,
    currentShippingPrice
  );
  let total =
    parseFloat(newTotal) +
    (globalPayingVat ? globalTaxForProducts + currentShippingTax : 0);
  return { label: "Total", type: "final", amount: total.toFixed(2) };
}

async function onShippingContactSelected(event, session) {
  try {
    let formattedtShippingArray = [];
    let formattedtShippingArrayPayPlus = [];
    const countryCode = event.shippingContact?.countryCode;
    const contact = {
      city: event.shippingContact.locality,
      country_iso: countryCode,
      postal_code: event.shippingContact.postalCode,
      country: event.shippingContact.country,
    };

    await updatePayingVat(contact);
    if (countryCode) {
      const arrayShipping = this.formattedShipping(
        countryCode,
        parseFloat(appleTotalPrice),
        false
      );
      formattedtShippingArray = arrayShipping.newShippingOptionsForApple;
      formattedtShippingArrayPayPlus =
        arrayShipping.newShippingOptionsForPayPlus;
      currentShippingArrayPayPlus = arrayShipping.newShippingOptionsForPayPlus;
    }

    updateApplePayConfig(
      formattedtShippingArray,
      formattedtShippingArrayPayPlus
    );
    session.completeShippingContactSelection({
      newShippingMethods: formattedtShippingArray,
      newTotal: {
        label: "Total",
        type: "final",
        amount:
          globalPriceProductsWithoutTax +
          parseFloat(currentShippingPrice) +
          (globalPayingVat
            ? parseFloat(currentShippingTax) + parseFloat(globalTaxForProducts)
            : 0),
      },
      newLineItems: updateLineItems(),
    });
  } catch (e) {
    displayMsgError(textError + e.message);
  }
}

function onShippingMethodSelected(event, session) {
  const selectedShippingMethod = event.shippingMethod;
  const checkShipping = applePayConfig.shippingMethods.filter(
    (item) => item.identifier === selectedShippingMethod.identifier
  );
  let shippingAmount;
  if (checkShipping.length === 0 && applePayConfig.shippingMethods.length) {
    shippingAmount = applePayConfig.shippingMethods[0].amount;
    currentShippingIdentifier = applePayConfig.shippingMethods[0].identifier;
  } else {
    shippingAmount = selectedShippingMethod.amount;
    currentShippingIdentifier = selectedShippingMethod.identifier;
  }

  currentShippingPrice = shippingAmount;
  const getShippingWithTaxObj = currentShippingArrayPayPlus.filter(
    (item) => item.identifier === currentShippingIdentifier
  );
  currentShippingTax = getShippingWithTaxObj[0]?.tax_amount;

  session.completeShippingMethodSelection({
    newTotal: calculateTotal(),
    newLineItems: updateLineItems(),
  });
}

function calculateNewTotal(subtotal, shippingAmount) {
  return parseFloat(subtotal) + parseFloat(shippingAmount);
}

async function onPaymentAuthorized(event, session) {
  try {
    let pageCheckout = !isProductPage;
    let quantity;
    if (productID) {
      const quantityObj = document.getElementsByClassName("qty");
      quantity = quantityObj ? quantityObj[0].value : 1;
    }

    if (
      !event.payment.shippingContact ||
      !event.payment.shippingContact.familyName ||
      !event.payment.shippingContact.givenName ||
      !event.payment.shippingContact.addressLines.length
    ) {
      session.completePayment(ApplePaySession.STATUS_FAILURE);
      //show error that missing address details on ApplePay
      return;
    }

    const additionalData = {
      product_id: productID,
      page_checkout: pageCheckout,
      quantity: quantity,
      method: "apple-pay",
      paying_vat: globalPayingVat,
      token: event.payment.token.paymentData,
      shipping: currentShippingIdentifier,
      contact: {
        customer_name: `${event.payment.shippingContact.givenName}  ${event.payment.shippingContact.familyName}`,
        email: event.payment.shippingContact.emailAddress,
        phone: event.payment.shippingContact.phoneNumber,
        address: event.payment.shippingContact.addressLines.join(", "),
        city: event.payment.shippingContact.locality,
        country_ISO: event.payment.shippingContact.countryCode,
      },
    };

    await jQuery.ajax({
      type: "post",
      dataType: "json",
      url: payplus_script.ajax_url,
      data: {
        action: "process-payment-oneclick",
        obj: additionalData,
        _ajax_nonce: payplus_script.frontNonce,
      },
      success: function (response) {
        if (response.status) {
          session.completePayment(ApplePaySession.STATUS_SUCCESS);
          setTimeout(() => (window.location.href = response.link), 500);
        } else {
          session.completePayment(ApplePaySession.STATUS_FAILURE);
          displayMsgError(response.payment_response.results.description);
        }
      },
      error: function (jqXHR, textStatus, errorThrow) {
        displayMsgError(textError + textStatus + "-" + errorThrow);
      },
    });
  } catch (e) {
    displayMsgError(textError + e.message);
  }
}

async function handleApplePayClick(event) {
  try {
    event.preventDefault();
    setApplePayConfig();
    displayMsgError();
    let session;
    applePayConfig.total.type = "pending";
    ArrayCheckoutItemsApplePay = [];
    session = new ApplePaySession(3, applePayConfig);
    session.begin();

    session.onvalidatemerchant = async function (event) {
      const data = await onValidateMerchant(event, session);
      if (data.status == false) {
        displayMsgError(data.payment_response.results.description);
        return;
      }
      session.completeMerchantValidation(data.payment_response);

      const data2 = await getTotalPriceCart();

      appleTotalPrice = 0;
      for (const product in data2["products"]) {
        appleTotalPrice +=
          Number(data2["products"][product]["quantity"]) *
          Number(data2["products"][product]["priceProductWithTax"]);
      }

      const {
        arrayItemApple,
        totalPrice,
        totalPriceWithoutTax,
        discountPrice,
        taxGlobal,
      } = formatedProductsArrayApple(data2);

      globalPriceProductsWithTax = totalPrice;
      globalPriceProductsWithoutTax = totalPriceWithoutTax;
      globalDiscount = discountPrice;
      globalTaxForProducts = taxGlobal;
      ArrayCheckoutItemsApplePay.push(...arrayItemApple);
      applePayConfig.lineItems = [...ArrayCheckoutItemsApplePay];
      applePayConfig.total.amount = totalPrice;
    };
    session.onshippingcontactselected = async function (event) {
      await onShippingContactSelected(event, session);
    };
    session.onshippingmethodselected = function (event) {
      onShippingMethodSelected(event, session);
    };
    session.onpaymentauthorized = async function (event) {
      await onPaymentAuthorized(event, session);
    };
  } catch (e) {
    AllShippingPayPlus;
    displayMsgError(textError + e.message);
  }
}

function correctShipping(allShipping, total, countryCode = false) {
  for (const key in allShipping) {
    for (const k in allShipping[key]) {
      if (allShipping[key][k]?.condition?.min_amount?.length) {
        if (
          Number(allShipping[key][k]?.condition?.min_amount) > Number(total)
        ) {
          const wantedValues = [`${k}`]; // Output: [0, 1, 2]
          allShipping[key].splice(k, 1);
        }
      }
    }
  }
  return allShipping;
}

function formattedShipping(countryCode, total, withTax = false) {
  let allShipping;
  let shippingWoo =
    document.getElementById("payplus_shipping_woo").value === "true";
  if (shippingWoo) {
    allShipping = document.getElementById("payplus_shipping").value;
    allShipping = JSON.parse(allShipping);
    correctShipping(allShipping, Number(total), countryCode);
  } else {
    const cost_shipping_with_tax = document.getElementById(
      "payplus_pricewt_shipping"
    ).value;
    const cost_shipping_without_tax = document.getElementById(
      "payplus_pricewithouttax_shipping"
    ).value;
    allShipping = {
      all: [
        {
          id: 0,
          title: "Shipping Delivery",
          cost_without_tax: cost_shipping_without_tax,
          cost_with_tax: cost_shipping_with_tax,
        },
      ],
    };
  }

  let newShippingOptionsForApple = [];
  let newShippingOptionsForPayPlus = [];
  if (allShipping) {
    let shippingOptions = [];

    if (allShipping.hasOwnProperty(countryCode)) {
      shippingOptions = allShipping[countryCode];
    } else if (allShipping.hasOwnProperty("all")) {
      shippingOptions = allShipping["all"];
    }

    newShippingOptionsForApple = shippingOptions.map((item) => ({
      min_amount: item.condition?.min_amount ?? null,
      identifier: `shipping-${item.id}`,
      label: item.title,
      detail: "shipping",
      amount: withTax
        ? (item.cost_with_tax || "0").toString()
        : (item.cost_without_tax || "0").toString(),
    }));

    newShippingOptionsForPayPlus = shippingOptions.map((item) => ({
      min_amount: item.condition?.min_amount ?? null,
      identifier: `shipping-${item.id}`,
      label: item.title,
      detail: "shipping",
      amount: withTax
        ? (item.cost_with_tax || "0").toString()
        : (item.cost_without_tax || "0").toString(),
      tax_amount:
        parseFloat(item.cost_with_tax || 0) -
        parseFloat(item.cost_without_tax || 0),
    }));
  }

  return { newShippingOptionsForApple, newShippingOptionsForPayPlus };
}
async function getTotalPriceCart() {
  return new Promise((resolve) => {
    const btnCart = jQuery(".single_add_to_cart_button");
    const formData = {};
    let formCart = btnCart.closest("form.cart").get(0);
    formCart = jQuery(formCart);

    formCart.serializeArray().forEach((item) => {
      formData[item.name] = item.value;
    });
    formData["product_id"] = productID;
    jQuery.ajax({
      type: "post",
      dataType: "json",
      url: payplus_script.ajax_url,
      data: {
        formData,
        action: "payplus-get-total-cart",
        _ajax_nonce: payplus_script.frontNonce,
      },
      success: function (response) {
        resolve(response);
        return;
      },
      error: function (jqXHR, textStatus, errorThrow) {
        displayMsgError(textError + textStatus + "-" + errorThrow);
        resolve(jqXHR);
        //showError
      },
    });
  });
}

function formatedProductsArrayApple(data) {
  const arrayItemApple = data.products.map((item) => {
    return {
      label: item.title,
      type: "final",
      amount: item.priceProductWithoutTax * item.quantity,
    };
  });
  return {
    arrayItemApple,
    totalPrice: parseFloat(data.total),
    totalPriceWithoutTax: parseFloat(data.total_without_tax),
    discountPrice: parseFloat(data.discountPrice),
    taxGlobal: parseFloat(data.taxGlobal),
  };
}

function formatedProductsArrayGoogle(data) {
  const arrayItemGoogle = data.products.map((item) => {
    return {
      type: "LINE_ITEM",
      label: item.title,
      status: "FINAL",
      price: (item.priceProductWithoutTax * item.quantity).toString(),
    };
  });

  const resultTaxGlobal = data.products.reduce(function (acc, obj) {
    return acc + (obj.priceProductWithTax - obj.priceProductWithoutTax);
  }, 0);

  return {
    arrayItemGoogle,
    totalPrice: parseFloat(data.total),
    totalPriceWithoutTax: parseFloat(data.total_without_tax),
    discountPrice: parseFloat(data.discountPrice),
    resultTaxGlobal: parseFloat(resultTaxGlobal),
    taxGlobal: parseFloat(data.taxGlobal),
  };
}

function displayMsgError(errorMsg = "") {
  const errorPayplusApi = document.getElementById("error-api-payplus");
  errorPayplusApi.innerHTML = "<p>" + errorMsg + "</p>";
}

function checkClassChange() {
  var button = document.querySelector(".single_add_to_cart_button");
  const applePay = document.getElementById("applePayButton");
  const googlePay = document.getElementById("googlePayButton");
  const expressCheckout = document.getElementById("express-checkout");

  if (button) {
    if (!button.classList.contains("disabled")) {
      applePay?.classList.remove("disabled");
      googlePay?.classList.remove("disabled");
      expressCheckout?.classList.remove("disabled");
    } else {
      if ((applePay || googlePay).classList.contains("disabled")) {
      } else {
        applePay?.classList.add("disabled");
        googlePay?.classList.add("disabled");
        expressCheckout?.classList.add("disabled");
      }
    }
  }
}

function checkArrayType(product) {
  console.log(product);
  const productData = product;

  // Check if it's an array
  if (Array.isArray(productData)) {
    // Check if the first element is an object or a string
    if (typeof productData[0] === "object" && !Array.isArray(productData[0])) {
      return 3;
    } else if (typeof productData[0] === "string") {
      console.log(`${product} is an array of strings.`);
    } else {
      console.log(`${product} contains a different type of data.`);
    }
  } else {
    console.log(`${product} is not an array.`);
  }
}

window.addEventListener("message", async function (event) {
  let paymentData = event.data;
  const senderOrigin = event.origin;
  const googleButton = document.getElementById("googlePayButton");
  const url = payment_url_google_pay_iframe;
  const domain = new URL(url).origin;
  if (senderOrigin === domain) {
    let productID =
      googleButton && googleButton.getAttribute("data-product-id");
    let quantity;
    if (productID) {
      const quantityObj = document.getElementsByClassName("qty");
      quantity = quantityObj ? quantityObj[0].value : 1;
    }

    if (paymentData.oneClickCheckoutGooglePay === "ProcessPayment") {
      paymentData = paymentData.data.paymentData;
      const additionalData = {
        product_id: productID,
        page_checkout: !isProductPage,
        method: "google-pay",
        quantity: quantity,
        token: paymentData?.paymentMethodData?.tokenizationData?.token,
        cardInfo: {
          info: paymentData?.paymentMethodData?.info,
        },
        shipping: paymentData?.shippingOptionData?.id,
        paying_vat: globalPayingVat,
        contact: {
          customer_name: paymentData.shippingAddress.name,
          email: paymentData.email,
          address: paymentData.shippingAddress.address1,
          city: paymentData.shippingAddress.locality,
          country_ISO: paymentData.shippingAddress.countryCode,
        },
      };
      jQuery.ajax({
        type: "post",
        dataType: "json",
        url: payplus_script.ajax_url,
        data: {
          action: "process-payment-oneclick",
          obj: additionalData,
          _ajax_nonce: payplus_script.frontNonce,
        },
        success: function (response) {
          if (response.status === true) {
            googleButton.contentWindow.postMessage("PAYMENT_SUCCESS", "*");
            setTimeout(() => (window.location.href = response.link), 500);
          } else {
            displayMsgError(response.payment_response.data.message);
            googleButton.contentWindow.postMessage("PAYMENT_ERROR", "*");
          }
        },
        error: function (jqXHR, textStatus, errorThrow) {
          displayMsgError(textError + textStatus + "-" + errorThrow);
          googleButton.contentWindow.postMessage("PAYMENT_ERROR", "*");
        },
      });
    } else if (paymentData.oneClickCheckoutGooglePay === "getCurrentPrice") {
      displayMsgError();
      let priceUpdatedNumber;
      let products = [];
      let currency_code = document.getElementById("payplus_currency_code");
      let priceUpdateWithTax = 0;
      let globalTaxForProducts = 0;
      let globalDiscount = 0;
      let calc = 0;
      const data2 = await getTotalPriceCart();

      for (const product in data2["products"]) {
        calc +=
          Number(data2["products"][product]["quantity"]) *
          Number(data2["products"][product]["priceProductWithTax"]);
      }

      const {
        arrayItemGoogle,
        totalPrice,
        totalPriceWithoutTax,
        discountPrice,
        taxGlobal,
      } = formatedProductsArrayGoogle(data2);

      products = arrayItemGoogle;
      priceUpdatedNumber = totalPriceWithoutTax;
      priceUpdateWithTax = totalPrice;
      globalDiscount = discountPrice;
      globalTaxForProducts = taxGlobal.toFixed(2);
      if (!priceUpdatedNumber) {
        displayMsgError(textError + "Empty shopping cart");
      }
      let shipping;
      let shippingWoo =
        document.getElementById("payplus_shipping_woo").value === "true";
      if (shippingWoo) {
        shipping = document.getElementById("payplus_shipping");
        if (shipping.value) {
          const encodedJson = shipping.value;
          const tempElement = document.createElement("textarea");
          tempElement.innerHTML = encodedJson;
          const decodedJson = tempElement.value;
          shipping = JSON.parse(decodedJson);
          shipping = correctShipping(shipping, calc);
        } else {
          shipping = {
            all: [
              {
                id: -1,
                title: "Shipping Delivery",
                cost_without_tax: 0,
                cost_with_tax: 0,
              },
            ],
          };
        }
      } else {
        const cost_shipping_with_tax = document.getElementById(
          "payplus_pricewt_shipping"
        ).value;
        const cost_shipping_without_tax = document.getElementById(
          "payplus_pricewithouttax_shipping"
        ).value;
        shipping = {
          all: [
            {
              id: 0,
              title: "Shipping Delivery",
              cost_without_tax: cost_shipping_without_tax,
              cost_with_tax: cost_shipping_with_tax,
            },
          ],
        };
      }
      if (window.location.host == "localhost") {
        displayMsgError(textError + "You cannot use a local server");
      } else {
        googleButton.contentWindow.postMessage(
          {
            startProcess: true,
            host: window.location.host,
            totalPriceWithoutTax: priceUpdatedNumber,
            taxProductsAmount: globalTaxForProducts,
            currencyCode: currency_code.value,
            shipping: shipping,
            products: products,
            discount: globalDiscount,
          },
          "*"
        );
      }
    } else if (paymentData.oneClickCheckoutGooglePay === "getPayingVat") {
      let contact = paymentData.data.contact;
      jQuery.ajax({
        type: "post",
        dataType: "json",
        url: payplus_script.ajax_url,
        data: {
          action: "check-customer-vat-oc",
          obj: contact,
          _ajax_nonce: payplus_script.frontNonce,
        },
        success: function (response) {
          const paying_vat = response.paying_vat;
          globalPayingVat = paying_vat;
          googleButton.contentWindow.postMessage(
            {
              paying_vat_check: paying_vat,
            },
            "*"
          );
        },
        error: function (jqXHR, textStatus, errorThrow) {
          displayMsgError(textError + textStatus + "-" + errorThrow);
        },
      });
    } else {
      displayMsgError("Server failure, please contact the site administrator");
    }
  }
});

setInterval(checkClassChange, 100);

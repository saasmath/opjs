
var PKI = require('cifre/forge/pki');
var SHA1 = require('cifre/forge/sha1');
var RSA = require('cifre/forge/rsa');
var ASN1 = require('cifre/forge/asn1');
var HMAC = require('cifre/forge/hmac');
var AES = require('cifre/aes');
var MD5 = require('cifre/md5');
var UTILS = require('cifre/utils');


describe("generate-peer-files", function() {

    it("generate 1028 bit", function(done) {

        this.timeout(10 * 1000);

        var size = 1028;
        var domain = "example.com";
        var saltBundle = {
            real: 'salt',
            data: 'goes',
            here: true
        };
        var identityBundle = [
            "real",
            "identities",
            "go",
            "here"
        ];
        var findSecret = 'YjAwOWE2YmU4OWNlOTdkY2QxNzY1NDA5MGYy';
        var message = "Happiness is the object and design of your existence " +
                      "and will be the end thereof, if you pursue the path " +
                      "that leads to it.";


        process.stdout.write("Generating " + size + "bit RSA key...");

        var before = Date.now();
        var pair = RSA.generateKeyPair(size, 0x10001);

        console.log(" (%sms)", Date.now() - before);


        console.log(PKI.privateKeyToPem(pair.privateKey));
        console.log(PKI.publicKeyToPem(pair.publicKey));

        console.log("Message:", message);

        var md = SHA1.create();
        md.start();
        md.update(message);

        var signature = new Buffer(pair.privateKey.sign(md), 'binary');

        console.log("Signature:", signature.toString('base64'));

        var now = Math.floor(Date.now() / 1000);
        var pub = formatPublicPeerFile({
          lifetime: 10845400, // Number of seconds till the file expires
          saltBundle: saltBundle,
          findSecret: findSecret,
          identityBundle: identityBundle,
          privateKey: pair.privateKey,
          publicKey: pair.publicKey,
          domain: domain
        });

        console.log(require('util').inspect(pub, {depth: null, colors: true}));

        var priv = formatPrivatePeerFile({
          contact: pub.contact,
          salt: randomID(),
          secret: randomID(),
          privateKey: pair.privateKey,
          publicPeerFile: pub
        });

        console.log(require('util').inspect(priv, {depth: null, colors: true}));

        return done(null);
    });

});


/**
 * OpenPeer bundle helper.  Takes a JSON object and signs it returning a JSON bundle
 *
 * @param name the JSON key to use for the original message.
 * @param message the message to sign.
 * @param key the RSA key to use to sign.
 * @param keyData extra data to put in the signature object.
 *
 * @return a new JSON object representing the signed bundle.
 *
 * @see http://docs.openpeer.org/OpenPeerProtocolSpecification/#GeneralRequestReplyNotifyAndResultFormationRules
 */ 
function formatBundle(name, message, key, keyData) {
  // Insert $id if none is found
  if (!message.$id) {
    message = merge({$id: randomID()}, message);
  }
  var id = message.$id;

  // Sort the keys while encoding as json.
  var json = sortedStringify(message);
  // And digest the message using sha1
  var md = SHA1.create();
  md.start();
  md.update(json);

  var bundle = {};
  bundle[name] = message;
  bundle.signature = {
    reference: '#' + id,
    algorithm: 'http://openpeer.org/2012/12/14/jsonsig#rsa-sha1',
    digestValue: binaryToBase64(md.digest().getBytes()),
    digestSigned: binaryToBase64(key.sign(md)),
    key: keyData
  };

  return bundle;
}

function binaryToBase64(binary) {
  // TODO: Implement this so it works in browsers too.
  return (new Buffer(binary, 'binary')).toString('base64')
}

function arrayToBase64(array) {
  // TODO: Implement a non-node version of this
  return (new Buffer(array)).toString('base64');
}

function randomID() {
  var id = '';
  for (var i = 0; i < 5; i++) {
    var part = (Math.random() * 0x100000000).toString(16);
    id += '00000000'.substr(part.length) + part;
  }
  return id;
}

function sortedStringify(object) {
  // TEMPORARY shortcut to not sort keys.
  return JSON.stringify(object);
  // TODO: uncomment the next line when we are ready to sort keys
  // return JSON.stringify(sortedReplacer(null, object), sortedReplacer);
}

// Replacer callback for JSON.stringify that sorts object keys.
function sortedReplacer(key, value) {
  if (typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  // Sort object keys.
  var obj = {};
  Object.keys(value).sort().forEach(function (key) {
    obj[key] = value[key];
  });
  return obj;
}

// Merge object b into object a, returning object a
function merge(a, b) {
  Object.keys(b).forEach(function (key) {
    a[key] = b[key];
  });
  return a;
}

/**
 * @param args is an object hash of the named arguments.
 *
 *   "privateKey" - RSA private key used to sign bundles
 *   "publicKey" - RSA public key stored in section A's signature
 *   "domain" - domain to use in contactURI
 *   "lifetime" - the number of seconds till this new file expires
 *   "saltBundle" - the actual saltBundle
 *   "findSecret" - Optional parameter that creates a section B
 *   "identityBundle" - Optional list of identity bundles
 *
 * @see http://docs.openpeer.org/OpenPeerProtocolSpecification/#TheMakeupOfThePublicPeerFile
 */
function formatPublicPeerFile(args) {
  if (!args.privateKey) throw new Error("privateKey is required");
  if (!args.publicKey) throw new Error("publicKey is required");
  if (!args.domain) throw new Error("domain is required");
  if (!args.lifetime) throw new Error("lifetime is required");
  if (!args.saltBundle) throw new Error("saltBundle is required");
  
  var now = Math.floor(Date.now() / 1000);
  var A = {
    $id: 'A',
    cipher: 'sha256/aes256',
    created: now,
    expires: now + args.lifetime,
    saltBundle: args.saltBundle
  };
  var sectionBundle = [formatBundle('section', A, args.privateKey, {
    x509Data: binaryToBase64(ASN1.toDer(PKI.publicKeyToAsn1(args.publicKey)).getBytes())
  })];

  var contact = getContactUri(A, args.domain);
  
  if (args.findSecret) {
    sectionBundle.push(formatBundle('section', {
      $id: 'B',
      contact: contact,
      findSecret: args.findSecret
    }, args.privateKey, {
      uri: contact
    }));
  }

  if (args.identityBundle) {
    sectionBundle.push(formatBundle('section', {
      $id: 'C',
      contact: contact,
      identities: {
        identityBundle: args.identityBundle
      }
    }, args.privateKey, {
      uri: contact
    }));
  }

  // Store the contact uri in the result, but hidden behind a prototype.
  var hidden = {
    contact: contact
  };
  var result = Object.create(hidden);
  result.peer = {
    $version: "1",
    sectionBundle: sectionBundle
  }
  return result;
}

function getContactUri(A, domain) {
  var md = SHA1.create();
  md.start();
  md.update(sortedStringify(A));
  return 'peer://' + domain + '/' + md.digest().toHex();
}


/**
 * @param args is an object hash of the named arguments.
 *   "contact" the contact URI
 *   "salt" a random salt
 *   "secret" a secret string used to encrypt the data and verify access
 *   "privateKey" the RSA private key
 *   "publicPeerFile" the public peer file
 *   "data" Optional extra data
 *
 * @see http://docs.openpeer.org/OpenPeerProtocolSpecification/#TheMakeupOfThePrivatePeerFile
 */
function formatPrivatePeerFile(args) {
  if (!args.contact) throw new Error("contact is required");
  if (!args.salt) throw new Error("salt is required");
  if (!args.secret) throw new Error("secret is required");
  if (!args.privateKey) throw new Error("privateKey is required");
  if (!args.publicPeerFile) throw new Error("publicPeerFile is required");
  
  var sectionBundle = [formatBundle('section', {
    $id: 'A',
    contact: args.contact,
    cipher: 'sha256/aes256',
    salt: args.salt,
    secretProof: binaryToBase64(calcHmac('proof:', args.contact).getBytes())
  }, args.privateKey, {
    uri: args.contact
  })];

  var pkcs = ASN1.toDer(PKI.privateKeyToAsn1(args.privateKey)).getBytes()
  var B = {
    $id: 'B',
    encryptedContact: encrypt('contact:', args.contact),
    encryptedPrivateKey: encrypt('privatekey:', pkcs),
    encryptedPeer: encrypt('peer:', JSON.stringify(args.publicPeerFile)),
  }
  if (args.data) {
    B.encryptedPrivateData = encrypt('data:', args.data);
  }
  sectionBundle.push(formatBundle('section', B, args.privateKey, {
    uri: args.contact
  }));

  function calcHmac(string) {
    var hm = HMAC.create();
    hm.start('sha256', args.secret);
    hm.update(string);
    return hm.getMac();
  }
  
  function encrypt(prefix, data) {
    var key = UTILS.fromhex(calcHmac(prefix + args.salt).toHex());
    var iv = MD5(prefix + args.salt);

    var length = data.length;
    var state = new Array(length);
    for (var i = 0; i < length; i++) {
      state[i] = data.charCodeAt(i);
    }
    AES.cfb.encrypt(state, key, iv);
    return arrayToBase64(state);
  }

  return {
    privatePeer: {
      $version: "1",
      sectionBundle: sectionBundle
    }
  };
}


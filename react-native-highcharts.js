import React, {Component, PropTypes,} from 'react';
import {
    AppRegistry,
    StyleSheet,
    Text,
    View,
    WebView,
    Image,
    Dimensions
} from 'react-native';


const win = Dimensions.get('window');

const stringifyConfig = cfg => JSON.stringify(
    JSON.stringify(cfg, (key, value) => {
        return (typeof value === 'function') ? `jsfunction://(${value.toString()})` : value;
    })
);

const setupChart = `(cfg, options, stock) => {
    const callbacks = {};
    let rpcId = 0;
    const config = JSON.parse(cfg, (key, value) => {
        if(typeof value === 'string'){
            const match = value.match(/jsfunction:\\/\\/\\(([\\s\\S]*)\\)/);
            if (!!match) {
                eval("var jsFunc = " + match[1]);
                return jsFunc;
            }
        }
        return value;
    });
    Highcharts.setOptions(options);
    document.addEventListener('message', ({data}) => {
        const {id, method, params = [], result, error} = JSON.parse(data);
        if (!!error) {
            callbacks[id] && callbacks[id].reject(error);
        } else if (!!method) {
            try {
                const parts = method.split(/[.\\[\\]]/).filter(val => !!val);
                let current = chart;
                for (let i = 0; i < parts.length - 1; i++) {
                    current = current[parts[i]];
                }
                const res = current[parts[parts.length - 1]](...params);
                __REACT_WEB_VIEW_BRIDGE.postMessage(JSON.stringify({id, result: JSON.stringify(res)}));
            } catch (e) {
                __REACT_WEB_VIEW_BRIDGE.postMessage(JSON.stringify({id, error: e.message}));
            }
        } else {
            callbacks[id] && callbacks[id].resolve(result);
        }
    });
    let chart;
    document.reactNativeHichartsMethod = async (method, ...params) => {
        const id = ++rpcId;
        const result = await new Promise((resolve, reject) => {
            callbacks[id] = {resolve, reject};
            __REACT_WEB_VIEW_BRIDGE.postMessage(JSON.stringify({id, method, params}));
            setTimeout(() => reject(new Error('Timeout of 5s exceeded')), 5000);
        });
        delete callbacks[id];
        return result;
    }
    chart = Highcharts[stock ? 'stockChart' : 'chart']('container', config);
}`;

class ChartWeb extends Component {

    callbacks = {};
    rpcId = 0;

    constructor(props) {
        super(props);

        this.state = {
            Wlayout: {
                height: win.height,
                width: win.width
            }
        }
    }

    getHTML = () => {
        return `
            <html>
                <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=0" />
                <style media="screen" type="text/css">
                #container {
                    width:100%;
                    height:100%;
                    top:0;
                    left:0;
                    right:0;
                    bottom:0;
                    position:absolute;
                    user-select: none;
                    -webkit-user-select: none;
                }
                </style>
                <head>
                    <script src="https://code.jquery.com/jquery-2.1.4.min.js"></script>
                    ${this.props.stock ? '<script src="https://code.highcharts.com/stock/highstock.js"></script>' : '<script src="https://code.highcharts.com/highcharts.js"></script>'}
                    ${this.props.more ? '<script src="https://code.highcharts.com/highcharts-more.js"></script>' : ''}
                    ${this.props.exporting ? '<script src="https://code.highcharts.com/modules/exporting.js"></script>' : ''}
                    <script>                        
                        $(() => {(${setupChart})(${stringifyConfig(this.props.config)}, ${JSON.stringify(this.props.options)}, ${this.props.stock});
                    });
                    </script>
                </head>
                <body>
                    <div id="container">
                    </div>
                </body>
            </html>
        `;
    };

    // used to resize on orientation of display
    reRenderWebView(e) {
        this.setState({
            height: e.nativeEvent.layout.height,
            width: e.nativeEvent.layout.width,
        })
    }

    onMessage = e => {
        const {id, method, params = [], result, error} = JSON.parse(e.nativeEvent.data);
        if (!!error) {
            this.callbacks[id] && this.callbacks[id].reject(error);
        } else if (!!method) {
            try {
                const {handlers: {[method]: handler = null} = {}} = this.props;
                if (handler) {
                    this.webView.postMessage(JSON.stringify({id, result: handler(...params)}));
                } else {
                    throw new Error(`Method ${method} has no handler`);
                }
            } catch ({message: error}) {
                this.webView.postMessage(JSON.stringify({id, error}));
            }
        } else {
            this.callbacks[id] && this.callbacks[id].resolve(result);
        }
    };

    callMethod = async (method, ...params) => {
        const id = ++this.rpcId;
        const res = await new Promise((resolve, reject) => {
            this.callbacks[id] = {resolve, reject};
            this.webView.postMessage(JSON.stringify({id, method, params}));
            setTimeout(() => reject(new Error('Timeout of 5s exceeded')), 5000);
        });
        delete this.callbacks[id];
        return res;
    };

    setWebView = (webView) => {
        this.webView = webView;
    };

    render() {
        return (
            <View style={this.props.style}>
                <WebView
                    ref={this.setWebView}
                    onMessage={this.onMessage}
                    onLayout={this.reRenderWebView}
                    style={styles.full}
                    source={{html: this.getHTML(), baseUrl: 'web/'}}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    scalesPageToFit={true}
                    scrollEnabled={false}
                    automaticallyAdjustContentInsets={true}
                />
            </View>
        );
    };
}

const styles = StyleSheet.create({
    full: {
        flex: 1,
        backgroundColor: 'transparent'
    }
});

module.exports = ChartWeb;

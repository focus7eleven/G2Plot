import * as G2 from '@antv/g2';
import * as _ from '@antv/util';
import { getComponent } from '../components/factory';
import BaseInteraction, { InteractionCtor } from '../interaction';
import { Axis, IInteractions, Label, Legend, StateConfig, Tooltip } from '../interface/config';
import { G2Config } from '../interface/config';
import { getGlobalTheme } from '../theme';
import PaddingController from './controller/padding';
import StateController from './controller/state';
import Layer, { LayerCfg } from './Layer-refactor';

export interface ViewLayerCfg extends LayerCfg {
  data: object[];
  meta?: { [fieldId: string]: any & { type?: any } };
  padding?: number | number[] | string;
  xField?: string;
  yField?: string;
  color?: string | string[] | {};
  size?: number | number[] | {};
  shape?: string | string[] | {};
  xAxis?: Axis;
  yAxis?: Axis;
  label?: Label;
  tooltip?: Tooltip;
  legend?: Legend;
  animation?: any | boolean;
  theme?: {} | string;
  responsiveTheme?: {} | string;
  interactions?: IInteractions[];
  responsive?: boolean;
  events?: {
    [k: string]: ((...args: any[]) => any) | boolean;
  };
  defaultState?: {
    active?: StateConfig;
    inActive?: StateConfig;
    selected?: StateConfig;
    disabled?: StateConfig;
  };
  // fixme: any
  [k: string]: any;
}

export default abstract class ViewLayer<T extends ViewLayerCfg = ViewLayerCfg> extends Layer {
  public view: G2.View;
  public theme: any;
  public initialOptions: T;
  public options: T;
  protected paddingController: PaddingController;
  protected stateController: StateController;
  protected config: G2Config;
  private interactions: BaseInteraction[];

  constructor(props: ViewLayerCfg) {
    super(props);
    this.options = this.getOptions(props);
    this.initialOptions = _.deepMix({}, this.options);
    this.paddingController = new PaddingController({
      plot: this,
    });
    this.stateController = new StateController({
      plot: this,
    });
    this.beforeInit();
    this.init();
    this.afterInit();
  }

  public getOptions(props: ViewLayerCfg) {
    const options = super.getOptions(props);
    const defaultOptions = {
      title: {
        visible: false,
      },
      description: {
        visible: false,
      },
      forceFit: true,
      padding: 'auto',
      legend: {
        visible: true,
        position: 'bottom-center',
      },
      tooltip: {
        visible: true,
        shared: true,
        crosshairs: {
          type: 'y',
        },
      },
      xAxis: {
        visible: true,
        autoHideLabel: false,
        autoRotateLabel: false,
        autoRotateTitle: false,
        grid: {
          visible: false,
        },
        line: {
          visible: false,
        },
        tickLine: {
          visible: true,
        },
        label: {
          visible: true,
        },
        title: {
          visible: false,
          offset: 12,
        },
      },
      yAxis: {
        visible: true,
        autoHideLabel: false,
        autoRotateLabel: false,
        autoRotateTitle: true,
        grid: {
          visible: true,
        },
        line: {
          visible: false,
        },
        tickLine: {
          visible: false,
        },
        label: {
          visible: true,
        },
        title: {
          visible: false,
          offset: 12,
        },
      },
      label: {
        visible: false,
      },
    };

    return _.deepMix({}, options, defaultOptions, props);
  }

  public beforeInit() {}

  public init() {
    const { layerBBox } = this;
    this.theme = getGlobalTheme(); // tempo: function getTheme
    this.config = {
      scales: {},
      legends: {},
      tooltip: {
        showTitle: true,
        triggerOn: 'mousemove',
        inPanel: true,
        useHtml: true,
      },
      axes: { fields: {} },
      coord: { type: 'cartesian' },
      elements: [],
      annotations: [],
      interactions: {},
      theme: this.theme,
      panelRange: {},
    };
    this._coord();
    this._scale();
    this._axis();
    this._tooltip();
    this._legend();
    this._addGeometry();
    this._annotation();
    this._animation();

    this.view = new G2.View({
      width: this.width,
      height: this.height,
      canvas: this.canvas,
      container: this.container,
      padding: this.paddingController.getPadding(),
      data: this.processData(this.options.data),
      theme: this.config.theme,
      options: this.config,
      start: { x: layerBBox.minX, y: layerBBox.minY },
      end: { x: layerBBox.maxX, y: layerBBox.maxY },
    });
  }

  public afterInit() {
    if (!this.view || this.view.destroyed) {
      return;
    }
  }

  /** 完整生命周期渲染 */
  public render(): void {
    const { data } = this.options;
    if (!_.isEmpty(data)) {
      this.view.render();
    }
    super.render();
  }

  /** 销毁 */
  public destroy(): void {
    this.doDestroy();
    super.destroy();
  }

  /** 更新配置项 */
  public updateConfig(cfg): void {
    this.doDestroy();
    if (!cfg.padding && this.initialOptions.padding && this.initialOptions.padding === 'auto') {
      cfg.padding = 'auto';
    }
    const newProps = _.deepMix({}, this.options, cfg);
    this.options = newProps;
    this.beforeInit();
    this.init();
    this.afterInit();
  }

  // plot 不断销毁重建，需要一个api获取最新的plot
  public getPlot() {
    return this.view;
  }

  // 绑定一个外部的stateManager
  public bindStateManager(stateManager, cfg): void {
    this.stateController.bindStateManager(stateManager, cfg);
  }

  // 响应状态量更新的快捷方法
  public setActive(condition, style) {
    this.stateController.setState({ type: 'active', condition, style });
  }

  public setSelected(condition, style) {
    this.stateController.setState({ type: 'selected', condition, style });
  }

  public setDisable(condition, style) {
    this.stateController.setState({ type: 'disable', condition, style });
  }

  public setNormal(condition) {
    this.stateController.setState({ type: 'normal', condition, style: {} });
  }

  // 获取 ViewLayer 的数据项
  public getData(start?: number, end?: number): object[] {
    return this.processData((this.options.data || []).slice(start, end));
  }

  protected processData(data?: object[]): object[] | undefined {
    return data;
  }

  protected abstract _coord(): void;

  protected _scale(): void {
    /** scale meta配置 */
    // this.config.scales中已有子图形在处理xAxis/yAxis是写入的xField/yField对应的scale信息，这里再检查用户设置的meta，将meta信息合并到默认的scale中
    const scales = _.assign({}, this.config.scales, this.options.meta || {});
    this.setConfig('scales', scales);
  }

  protected _axis(): void {
    const xAxis_parser = getComponent('axis', {
      plot: this,
      dim: 'x',
    });
    const yAxis_parser = getComponent('axis', {
      plot: this,
      dim: 'y',
    });
    const axesConfig = { fields: {} };
    axesConfig.fields[this.options.xField] = xAxis_parser;
    axesConfig.fields[this.options.yField] = yAxis_parser;
    /** 存储坐标轴配置项到config */
    this.setConfig('axes', axesConfig);
  }

  protected _tooltip(): void {
    if (this.options.tooltip.visible === false) {
      this.setConfig('tooltip', false);
      return;
    }

    this.setConfig('tooltip', {
      crosshairs: _.get(this.options, 'tooltip.crosshairs'),
      shared: _.get(this.options, 'tooltip.shared'),
      htmlContent: _.get(this.options, 'tooltip.htmlContent'),
      containerTpl: _.get(this.options, 'tooltip.containerTpl'),
      itemTpl: _.get(this.options, 'tooltip.itemTpl'),
    });

    if (this.options.tooltip.style) {
      _.deepMix(this.config.theme.tooltip, this.options.tooltip.style);
    }
  }

  protected _legend(): void {
    if (this.options.legend.visible === false) {
      this.setConfig('legends', false);
      return;
    }
    const flipOption = _.get(this.options, 'legend.flipPage');
    this.setConfig('legends', {
      position: _.get(this.options, 'legend.position'),
      formatter: _.get(this.options, 'legend.formatter'),
      offsetX: _.get(this.options, 'legend.offsetX'),
      offsetY: _.get(this.options, 'legend.offsetY'),
      flipPage: flipOption,
    });
  }

  protected abstract _annotation(): void;
  protected abstract _addGeometry(): void;
  protected abstract geometryParser(dim: string, type: string): string;
  protected abstract _animation(): void;
  protected _interactions(): void {}

  /** 设置G2 config，带有类型推导 */
  protected setConfig<K extends keyof G2Config>(key: K, config: G2Config[K] | boolean): void {
    if (key === 'element') {
      this.config.elements.push(config as G2Config['element']);
      return;
    }
    if ((config as boolean) === false) {
      this.config[key] = false;
      return;
    }
    _.assign(this.config[key], config);
  }

  /** 抽取destroy和updateConfig共有代码为_destroy方法 */
  private doDestroy() {
    // 移除注册的 interactions
    if (this.interactions) {
      this.interactions.forEach((inst) => {
        inst.destroy();
      });
    }
    /** 销毁g2.view实例 */
    this.view.destroy();
  }
}

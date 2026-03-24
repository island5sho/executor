import type { Source } from "@executor/react";
import type { ComponentType, ReactNode } from "react";

export type ExecutorFrontendPlugin = {
  key: string;
  register: (api: ExecutorFrontendPluginApi) => void;
};

export type ExecutorFrontendPluginApi = {
  sources: {
    registerType: (
      definition: FrontendSourceTypeDefinition,
    ) => void;
  };
};

export type SourcePluginDetailRouteContext = {
  search?: unknown;
  navigate?: unknown;
};

export type SourcePluginAddScreenProps<Input, Client = unknown> = {
  initialValue: Input;
  client: Client;
  onSubmit: (input: Input) => Promise<void>;
};

export type SourcePluginEditScreenProps<Config, Client = unknown> = {
  sourceId: string;
  config: Config;
  client: Client;
  onSubmit: (config: Config) => Promise<void>;
};

export type SourcePluginDetailScreenProps<Config, Client = unknown> = {
  sourceId: string;
  config: Config;
  client: Client;
};

export type FrontendSourceTypeDefinition = {
  kind: string;
  displayName: string;
  renderAddPage: () => ReactNode;
  renderEditPage?: (input: { source: Source }) => ReactNode;
  renderDetailPage?: (input: {
    source: Source;
    route: SourcePluginDetailRouteContext;
  }) => ReactNode;
};

export const defineFrontendSourceType = <Input, Config, Client>(input: {
  kind: string;
  displayName: string;
  createInitialInput: () => Input;
  client: Client;
  addScreen: ComponentType<SourcePluginAddScreenProps<Input, Client>>;
  editScreen?: ComponentType<SourcePluginEditScreenProps<Config, Client>>;
  detailScreen?: ComponentType<SourcePluginDetailScreenProps<Config, Client>>;
  configFromSource?: (source: Source) => Config;
}): FrontendSourceTypeDefinition => {
  const renderEditPage = (() => {
    if (input.editScreen === undefined || input.configFromSource === undefined) {
      return undefined;
    }

    const EditScreen = input.editScreen;
    const configFromSource = input.configFromSource;
    return ({ source }: { source: Source }) => (
      <EditScreen
        sourceId={source.id}
        config={configFromSource(source)}
        client={input.client}
        onSubmit={async () => {}}
      />
    );
  })();

  const renderDetailPage = (() => {
    if (input.detailScreen === undefined || input.configFromSource === undefined) {
      return undefined;
    }

    const DetailScreen = input.detailScreen;
    const configFromSource = input.configFromSource;
    return ({ source }: { source: Source }) => (
      <DetailScreen
        sourceId={source.id}
        config={configFromSource(source)}
        client={input.client}
      />
    );
  })();

  return {
    kind: input.kind,
    displayName: input.displayName,
    renderAddPage: () =>
      <input.addScreen
        initialValue={input.createInitialInput()}
        client={input.client}
        onSubmit={async () => {}}
      />,
    renderEditPage,
    renderDetailPage: renderDetailPage
      ? ({ source }) => renderDetailPage({ source })
      : undefined,
  };
};

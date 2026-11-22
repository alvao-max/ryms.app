export default class Anthropic {
  static APIError = class extends Error {};
  messages = {
    parse: async () => {
      throw new Error("Ingen AI-tjänst i förhandsvisningen");
    },
  };
}
export const zodOutputFormat = () => ({});

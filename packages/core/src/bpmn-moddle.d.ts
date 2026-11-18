declare module 'bpmn-moddle' {
  // Tipagem mínima para os testes: o bpmn-moddle não expõe tipos na raiz do pacote.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Qualquer = any;
  export class BpmnModdle {
    fromXML(xml: string): Promise<{ rootElement: Qualquer; warnings: unknown[] }>;
  }
}

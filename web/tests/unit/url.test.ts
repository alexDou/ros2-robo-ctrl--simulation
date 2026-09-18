import { describe, it, expect, afterEach } from 'vitest';
import { getParam, getAllParams, resolveGatewayWsUrl } from '@utils/url';

describe('URL query parameter utilities', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  function setWindowSearch(search: string) {
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        search,
      },
      writable: true,
    });
  }

  describe('getParam', () => {
    it('returns parameter value when present in search string', () => {
      setWindowSearch('?robot_id=robot-42&mode=auto');
      expect(getParam('robot_id')).toBe('robot-42');
      expect(getParam('mode')).toBe('auto');
    });

    it('supports custom search string argument', () => {
      expect(getParam('robot_id', '?robot_id=ur5e-alpha')).toBe('ur5e-alpha');
    });

    it('throws Error when parameter is absent', () => {
      setWindowSearch('?other=123');
      expect(() => getParam('robot_id')).toThrow(
        'Missing required URL query parameter: "robot_id"'
      );
    });

    it('throws Error when parameter is empty string', () => {
      setWindowSearch('?robot_id=');
      expect(() => getParam('robot_id')).toThrow(
        'Missing required URL query parameter: "robot_id"'
      );
    });

    it('throws Error when search string is completely empty', () => {
      setWindowSearch('');
      expect(() => getParam('robot_id')).toThrow(
        'Missing required URL query parameter: "robot_id"'
      );
    });
  });

  describe('getAllParams', () => {
    it('returns empty object when no parameters are present', () => {
      setWindowSearch('');
      expect(getAllParams()).toEqual({});
    });

    it('returns record of all parsed query parameters', () => {
      setWindowSearch('?robot_id=0&channel=teleop&debug=true');
      expect(getAllParams()).toEqual({
        robot_id: '0',
        channel: 'teleop',
        debug: 'true',
      });
    });

    it('supports custom search string argument', () => {
      expect(getAllParams('?a=1&b=2')).toEqual({ a: '1', b: '2' });
    });
  });

  describe('resolveGatewayWsUrl', () => {
    it('returns explicit gatewayWsUrl override when provided', () => {
      expect(resolveGatewayWsUrl('robot-0', 'ws://custom-host:9999/ws')).toBe(
        'ws://custom-host:9999/ws'
      );
    });

    it('constructs ws URL using default port 8080 when query parameter is absent', () => {
      setWindowSearch('');
      expect(resolveGatewayWsUrl('robot-0')).toBe(
        'ws://localhost:8080/ws/teleop/robot/robot-0'
      );
    });

    it('uses gateway_port query parameter when present', () => {
      setWindowSearch('?gateway_port=9090');
      expect(resolveGatewayWsUrl('robot-1')).toBe(
        'ws://localhost:9090/ws/teleop/robot/robot-1'
      );
    });
  });
});

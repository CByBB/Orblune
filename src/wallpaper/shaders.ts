export const mapVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Bump when fragment logic changes so Globe rebuilds the GPU program. */
export const MAP_SHADER_REV = 3;

/** Flat equirectangular day/night with soft terminator + map themes. */
export const mapFragmentShader = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D cloudMap;
uniform vec2 sunLatLon;
uniform float twilightWidth;
uniform float cloudOpacity;
// 0 natural, 1 aqua, 2 atlas, 3 vivid, 4 noir,
// 5 ember, 6 frost, 7 verdant, 8 ink, 9 sand
uniform float themeIndex;

varying vec2 vUv;

vec3 latLonToNormal(float latDeg, float lonDeg) {
  float lat = radians(latDeg);
  float lon = radians(lonDeg);
  return normalize(vec3(
    cos(lat) * sin(lon),
    sin(lat),
    cos(lat) * cos(lon)
  ));
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Float ranges only — avoids int branching quirks on some WebView GPUs.
vec3 applyThemeDay(vec3 c, float theme) {
  float L = luma(c);
  float water = step(c.r + 0.02, c.b) * step(c.g - 0.04, c.b) * step(L, 0.72);

  // 0 Natural
  if (theme < 0.5) {
    return c * 1.05;
  }
  // 1 Sea glass
  if (theme < 1.5) {
    vec3 teal = mix(vec3(0.38, 0.78, 0.88), vec3(0.22, 0.55, 0.70), 1.0 - c.b);
    vec3 land = mix(vec3(L), c, 0.9) * vec3(0.96, 1.06, 0.94) * 1.05;
    return clamp(mix(land, teal, water * 0.82), 0.0, 1.0);
  }
  // 2 Atlas
  if (theme < 2.5) {
    vec3 ocean = mix(vec3(0.58, 0.70, 0.74), vec3(0.38, 0.52, 0.58), 1.0 - c.b);
    c = mix(c, ocean, water * 0.7);
    c = mix(vec3(L), c, 0.82);
    c *= vec3(1.12, 1.04, 0.86);
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.16);
    return clamp(c, 0.0, 1.0);
  }
  // 3 Vivid
  if (theme < 3.5) {
    c = c * 1.15 + (c - vec3(L)) * 0.55;
    c *= mix(vec3(1.1, 1.12, 0.9), vec3(0.75, 1.08, 1.35), water);
    return clamp(c, 0.0, 1.0);
  }
  // 4 Noir
  if (theme < 4.5) {
    return clamp(vec3(L) * vec3(0.78, 0.88, 1.05) * 1.08, 0.0, 1.0);
  }
  // 5 Ember
  if (theme < 5.5) {
    vec3 ocean = mix(vec3(0.12, 0.18, 0.42), vec3(0.05, 0.08, 0.22), 1.0 - c.b);
    vec3 land = mix(vec3(L), c, 0.55) * vec3(1.45, 0.78, 0.42);
    land = mix(land, vec3(L * 1.2, L * 0.55, L * 0.22), 0.25);
    return clamp(mix(land, ocean, water * 0.9), 0.0, 1.0);
  }
  // 6 Frost
  if (theme < 6.5) {
    vec3 ice = mix(vec3(0.45, 0.78, 0.92), vec3(0.22, 0.48, 0.68), 1.0 - c.b);
    vec3 land = mix(vec3(L), c, 0.35) * vec3(0.82, 0.98, 1.2);
    land = mix(land, vec3(0.88, 0.94, 1.0), smoothstep(0.4, 0.85, L) * 0.45);
    return clamp(mix(land, ice, water * 0.85) * 1.06, 0.0, 1.0);
  }
  // 7 Verdant
  if (theme < 7.5) {
    vec3 ocean = mix(vec3(0.1, 0.42, 0.55), vec3(0.04, 0.22, 0.36), 1.0 - c.b);
    vec3 land = mix(vec3(L), c, 0.7) * vec3(0.7, 1.35, 0.65);
    float g = clamp(land.g - max(land.r, land.b), 0.0, 1.0);
    land = mix(land, vec3(0.25, 0.75, 0.28) * (0.4 + L), 0.2 + g * 0.35);
    return clamp(mix(land, ocean, water * 0.8), 0.0, 1.0);
  }
  // 8 Ink
  if (theme < 8.5) {
    vec3 ocean = mix(vec3(0.04, 0.12, 0.32), vec3(0.01, 0.04, 0.14), 1.0 - c.b);
    vec3 land = vec3(L) * vec3(0.45, 0.75, 1.15);
    land = mix(land, vec3(0.35, 0.7, 0.95) * L, 0.35);
    return clamp(mix(land, ocean, water * 0.92), 0.0, 1.0);
  }
  // 9 Sand
  vec3 ocean = mix(vec3(0.42, 0.58, 0.62), vec3(0.28, 0.42, 0.48), 1.0 - c.b);
  vec3 land = mix(vec3(L), c, 0.5) * vec3(1.35, 1.08, 0.62);
  land = mix(land, vec3(0.95, 0.78, 0.45) * (0.35 + L * 0.75), 0.32);
  return clamp(mix(land, ocean, water * 0.72), 0.0, 1.0);
}

vec3 applyThemeNight(vec3 dayGraded, vec3 lights, float theme) {
  vec3 terrain;
  vec3 city;
  float L = luma(dayGraded);

  if (theme < 0.5) {
    terrain = mix(vec3(0.02, 0.04, 0.07), dayGraded * vec3(0.18, 0.22, 0.30), 0.85);
    city = lights * lights * 1.8;
  } else if (theme < 1.5) {
    terrain = mix(vec3(0.02, 0.05, 0.08), dayGraded * vec3(0.14, 0.24, 0.32), 0.82);
    city = lights * lights * vec3(1.5, 1.7, 1.9) * 1.5;
  } else if (theme < 2.5) {
    terrain = mix(vec3(0.04, 0.03, 0.02), dayGraded * vec3(0.28, 0.22, 0.16), 0.8);
    city = lights * lights * vec3(2.0, 1.5, 0.9) * 1.6;
  } else if (theme < 3.5) {
    terrain = mix(vec3(0.01, 0.03, 0.08), dayGraded * vec3(0.12, 0.18, 0.36), 0.85);
    city = lights * lights * 2.1;
  } else if (theme < 4.5) {
    terrain = mix(vec3(0.02, 0.025, 0.04), vec3(L) * 0.22, 0.9);
    city = lights * lights * vec3(1.9, 1.55, 0.85) * 1.7;
  } else if (theme < 5.5) {
    terrain = mix(vec3(0.06, 0.015, 0.03), dayGraded * vec3(0.4, 0.12, 0.06), 0.85);
    city = lights * lights * vec3(2.6, 1.2, 0.35) * 2.0;
  } else if (theme < 6.5) {
    terrain = mix(vec3(0.015, 0.04, 0.1), dayGraded * vec3(0.1, 0.22, 0.42), 0.88);
    city = lights * lights * vec3(1.15, 1.75, 2.4) * 1.8;
  } else if (theme < 7.5) {
    terrain = mix(vec3(0.015, 0.05, 0.03), dayGraded * vec3(0.08, 0.32, 0.14), 0.86);
    city = lights * lights * vec3(1.85, 1.9, 0.95) * 1.75;
  } else if (theme < 8.5) {
    terrain = mix(vec3(0.005, 0.015, 0.05), dayGraded * vec3(0.06, 0.12, 0.3), 0.9);
    city = lights * lights * vec3(0.9, 1.9, 2.6) * 2.1;
  } else {
    terrain = mix(vec3(0.05, 0.03, 0.015), dayGraded * vec3(0.35, 0.22, 0.1), 0.85);
    city = lights * lights * vec3(2.4, 1.5, 0.55) * 1.75;
  }
  return terrain + city;
}

void main() {
  vec2 uv = vUv;
  float lon = uv.x * 360.0 - 180.0;
  float lat = 90.0 - uv.y * 180.0;

  float edge = min(uv.x, 1.0 - uv.x);
  float seamW = 1.0 - smoothstep(0.0, 0.006, edge);
  vec3 day = texture2D(dayMap, uv).rgb;
  vec3 lights = texture2D(nightMap, uv).rgb;
  float cloud = texture2D(cloudMap, uv).r;
  if (seamW > 0.0) {
    vec2 uv2 = vec2(uv.x < 0.5 ? uv.x + 1.0 : uv.x - 1.0, uv.y);
    day = mix(day, 0.5 * (day + texture2D(dayMap, uv2).rgb), seamW);
    lights = mix(lights, 0.5 * (lights + texture2D(nightMap, uv2).rgb), seamW);
  }

  vec3 n = latLonToNormal(lat, lon);
  vec3 s = latLonToNormal(sunLatLon.x, sunLatLon.y);
  float ndotl = dot(n, s);
  float dayFactor = smoothstep(-twilightWidth, twilightWidth * 1.35, ndotl);

  float theme = clamp(themeIndex, 0.0, 9.0);
  vec3 dayLit = applyThemeDay(day, theme);
  dayLit = mix(dayLit, dayLit * dayLit * (3.0 - 2.0 * dayLit), 0.05);

  vec3 night = applyThemeNight(dayLit, lights, theme);
  vec3 color = mix(night, dayLit, dayFactor);

  float cloudAmt = cloud * cloudOpacity * 0.15 * dayFactor;
  if (theme > 3.5 && theme < 4.5) cloudAmt *= 0.5;
  if (theme > 4.5 && theme < 5.5) cloudAmt *= 0.65;
  if (theme > 7.5 && theme < 8.5) cloudAmt *= 0.5;
  color = mix(color, vec3(0.94, 0.96, 0.98), cloudAmt);

  gl_FragColor = vec4(color, 1.0);
}
`;

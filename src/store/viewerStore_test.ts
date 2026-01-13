import { assertEquals } from "jsr:@std/assert";
import { beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { useViewerStore } from "./viewerStore.ts";

describe("viewerStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useViewerStore.setState({
      pointSize: 2,
      colorMode: "rgb",
      showCameras: true,
      cameraScale: 0.2,
      selectedPointId: null,
      selectedImageId: null,
      autoRotate: false,
      backgroundColor: "#ffffff",
      viewResetTrigger: 0,
      minTrackLength: 2,
      showAxes: true,
      axesOpacity: 1,
      showImagePlanes: false,
      imagePlaneOpacity: 0.9,
      showMatches: false,
      matchesOpacity: 1,
      imageDetailId: null,
      showPoints2D: false,
      showPoints3D: false,
      showMatchesInModal: false,
      matchedImageId: null,
      flyToImageId: null,
    });
  });

  describe("point settings", () => {
    it("should update point size", () => {
      const { setPointSize } = useViewerStore.getState();
      setPointSize(5);
      assertEquals(useViewerStore.getState().pointSize, 5);
    });

    it("should update color mode", () => {
      const { setColorMode } = useViewerStore.getState();
      setColorMode("error");
      assertEquals(useViewerStore.getState().colorMode, "error");
    });

    it("should update min track length", () => {
      const { setMinTrackLength } = useViewerStore.getState();
      setMinTrackLength(5);
      assertEquals(useViewerStore.getState().minTrackLength, 5);
    });
  });

  describe("camera settings", () => {
    it("should toggle camera visibility", () => {
      const { setShowCameras } = useViewerStore.getState();
      setShowCameras(false);
      assertEquals(useViewerStore.getState().showCameras, false);
    });

    it("should update camera scale", () => {
      const { setCameraScale } = useViewerStore.getState();
      setCameraScale(0.5);
      assertEquals(useViewerStore.getState().cameraScale, 0.5);
    });
  });

  describe("selection", () => {
    it("should select and deselect image", () => {
      const { setSelectedImageId } = useViewerStore.getState();

      setSelectedImageId(42);
      assertEquals(useViewerStore.getState().selectedImageId, 42);

      setSelectedImageId(null);
      assertEquals(useViewerStore.getState().selectedImageId, null);
    });

    it("should select and deselect point", () => {
      const { setSelectedPointId } = useViewerStore.getState();

      setSelectedPointId(BigInt(123));
      assertEquals(useViewerStore.getState().selectedPointId, BigInt(123));

      setSelectedPointId(null);
      assertEquals(useViewerStore.getState().selectedPointId, null);
    });
  });

  describe("image detail modal", () => {
    it("should open image detail and reset matchedImageId", () => {
      const { openImageDetail, setMatchedImageId } = useViewerStore.getState();

      setMatchedImageId(10);
      assertEquals(useViewerStore.getState().matchedImageId, 10);

      openImageDetail(5);
      assertEquals(useViewerStore.getState().imageDetailId, 5);
      assertEquals(useViewerStore.getState().matchedImageId, null);
    });

    it("should close image detail and reset matchedImageId", () => {
      const { openImageDetail, setMatchedImageId, closeImageDetail } =
        useViewerStore.getState();

      openImageDetail(5);
      setMatchedImageId(10);

      closeImageDetail();
      assertEquals(useViewerStore.getState().imageDetailId, null);
      assertEquals(useViewerStore.getState().matchedImageId, null);
    });

    it("should toggle showMatchesInModal", () => {
      const { setShowMatchesInModal } = useViewerStore.getState();

      setShowMatchesInModal(true);
      assertEquals(useViewerStore.getState().showMatchesInModal, true);

      setShowMatchesInModal(false);
      assertEquals(useViewerStore.getState().showMatchesInModal, false);
    });
  });

  describe("view controls", () => {
    it("should toggle auto rotate", () => {
      const { setAutoRotate } = useViewerStore.getState();
      setAutoRotate(true);
      assertEquals(useViewerStore.getState().autoRotate, true);
    });

    it("should update background color", () => {
      const { setBackgroundColor } = useViewerStore.getState();
      setBackgroundColor("#000000");
      assertEquals(useViewerStore.getState().backgroundColor, "#000000");
    });

    it("should increment view reset trigger", () => {
      const { resetView } = useViewerStore.getState();
      const initialTrigger = useViewerStore.getState().viewResetTrigger;

      resetView();
      assertEquals(
        useViewerStore.getState().viewResetTrigger,
        initialTrigger + 1
      );
    });
  });

  describe("helpers visibility", () => {
    it("should toggle axes and set opacity", () => {
      const { setShowAxes, setAxesOpacity } = useViewerStore.getState();

      setShowAxes(false);
      assertEquals(useViewerStore.getState().showAxes, false);

      setAxesOpacity(0.5);
      assertEquals(useViewerStore.getState().axesOpacity, 0.5);
    });

    it("should toggle image planes and set opacity", () => {
      const { setShowImagePlanes, setImagePlaneOpacity } =
        useViewerStore.getState();

      setShowImagePlanes(true);
      assertEquals(useViewerStore.getState().showImagePlanes, true);

      setImagePlaneOpacity(0.7);
      assertEquals(useViewerStore.getState().imagePlaneOpacity, 0.7);
    });

    it("should toggle matches and set opacity", () => {
      const { setShowMatches, setMatchesOpacity } = useViewerStore.getState();

      setShowMatches(true);
      assertEquals(useViewerStore.getState().showMatches, true);

      setMatchesOpacity(0.8);
      assertEquals(useViewerStore.getState().matchesOpacity, 0.8);
    });
  });

  describe("fly to image", () => {
    it("should set and clear fly to image", () => {
      const { flyToImage, clearFlyTo } = useViewerStore.getState();

      flyToImage(42);
      assertEquals(useViewerStore.getState().flyToImageId, 42);

      clearFlyTo();
      assertEquals(useViewerStore.getState().flyToImageId, null);
    });
  });
});
